import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play } from 'lucide-react';
import './App.css';
import { GameEngine } from './game/GameEngine';
import { PoseTracker, type PoseDebugState } from './pose/PoseTracker';
import { useAuth } from './firebase/useAuth';
import { getLeaderboard, submitRun, syncUser } from './api/client';
import StartScreen from './components/StartScreen';
import SignInScreen from './components/SignInScreen';
import CalibrationScreen from './components/CalibrationScreen';
import GameCanvas from './components/GameCanvas';
import CameraPreview from './components/CameraPreview';
import HUD from './components/HUD';
import GameOverScreen from './components/GameOverScreen';
import LeaderboardScreen from './components/LeaderboardScreen';
import type { GameSnapshot, GameStats } from './game/types';

type Screen = 'start' | 'signing-in' | 'calibrating' | 'playing' | 'gameover' | 'leaderboard';

export default function App() {
  const engine = useMemo(() => new GameEngine(), []);
  const poseTracker = useMemo(() => new PoseTracker(), []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const submittedRef = useRef(false);

  const { user, signIn, signOut } = useAuth();

  const [screen, setScreen] = useState<Screen>('start');
  const [leaderboardOrigin, setLeaderboardOrigin] = useState<'start' | 'gameover'>('start');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [debug, setDebug] = useState<PoseDebugState | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot>({
    status: 'idle',
    stats: engine.getStats(),
  });

  const setupCamera = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await poseTracker.init();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      poseTracker.start(videoRef.current!);
      setScreen('calibrating');
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access and try again.'
          : 'Could not start camera or pose landmarker. You can still test with keyboard fallback!',
      );
      // Camera failures always surface via StartScreen's existing error UI,
      // whether setupCamera was triggered directly from Start (already
      // there — this is a no-op) or from just after a successful sign-in
      // (SignInScreen has no camera-error UI of its own).
      setScreen('start');
    } finally {
      setLoading(false);
    }
  }, [poseTracker]);

  const resetRunGuard = useCallback(() => {
    submittedRef.current = false;
    setRank(null);
  }, []);

  // Only ever called while transitioning playing -> gameover, so `user`
  // cannot legitimately change mid-flight — see the effect below, whose
  // dependency on this callback means a sign-in/sign-out would otherwise
  // resubscribe engine listeners with a stale `user` closure.
  const submitRunAndFetchRank = useCallback(
    async (stats: GameStats) => {
      if (!user) return;
      const result = await submitRun(user, {
        score: Math.floor(stats.score),
        calories: stats.caloriesBurnt,
        durationSec: Math.ceil(stats.elapsedMs / 1000),
      }).catch(() => null);
      if (!result || !result.ok) return;

      const leaderboard = await getLeaderboard('weekly').catch(() => null);
      if (!leaderboard) return;
      const myIndex = leaderboard.entries.findIndex((entry) => entry.uid === user.uid);
      if (myIndex !== -1) setRank(myIndex + 1);
    },
    [user],
  );

  // Subscribe to engine + pose tracker once.
  useEffect(() => {
    const unsubEngine = engine.subscribe((snap) => {
      setSnapshot(snap);
      if (snap.status === 'gameover') {
        setScreen('gameover');
        if (!submittedRef.current) {
          submittedRef.current = true;
          void submitRunAndFetchRank(snap.stats);
        }
      }
    });
    const unsubDebug = poseTracker.onDebug(setDebug);
    const unsubAction = poseTracker.onAction((action) => engine.handleAction(action));
    return () => {
      unsubEngine();
      unsubDebug();
      unsubAction();
    };
  }, [engine, poseTracker, submitRunAndFetchRank]);

  // Keyboard fallback so the game can be tested/played without a camera.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (screen === 'playing' || snapshot.status === 'paused') {
          engine.handleAction('TOGGLE_PAUSE');
          return;
        }
      }
      if (screen !== 'playing') return;
      if (e.code === 'ArrowUp' || e.code === 'Space') engine.handleAction('JUMP');
      if (e.code === 'ArrowDown') engine.handleAction('DUCK_START');
      if (e.code === 'ArrowLeft') engine.handleAction('MOVE_LEFT');
      if (e.code === 'ArrowRight') engine.handleAction('MOVE_RIGHT');
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (screen !== 'playing') return;
      if (e.code === 'ArrowDown') engine.handleAction('DUCK_END');
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [engine, screen, snapshot.status]);

  const handlePlayTap = useCallback(() => {
    if (!user) {
      setSignInError(null);
      setScreen('signing-in');
      return;
    }
    void setupCamera();
  }, [user, setupCamera]);

  const handleSignIn = useCallback(async () => {
    setSignInError(null);
    setSigningIn(true);
    try {
      const signedInUser = await signIn();
      syncUser(signedInUser).catch(() => {});
      await setupCamera();
    } catch (e) {
      console.error(e);
      setSignInError('Could not sign in. Please try again.');
    } finally {
      setSigningIn(false);
    }
  }, [signIn, setupCamera]);

  const handleCalibrationDone = useCallback(() => {
    poseTracker.calibrateNow();
    resetRunGuard();
    engine.start();
    setScreen('playing');
  }, [engine, poseTracker, resetRunGuard]);

  const handleRestart = useCallback(() => {
    resetRunGuard();
    if (poseTracker.isCalibrated()) {
      engine.start();
      setScreen('playing');
    } else {
      setScreen('calibrating');
    }
  }, [engine, poseTracker, resetRunGuard]);

  const handleTogglePause = useCallback(() => {
    engine.togglePause();
  }, [engine]);

  const openLeaderboard = useCallback(() => {
    setLeaderboardOrigin(screen === 'gameover' ? 'gameover' : 'start');
    setScreen('leaderboard');
  }, [screen]);

  const closeLeaderboard = useCallback(() => {
    setScreen(leaderboardOrigin);
  }, [leaderboardOrigin]);

  useEffect(() => {
    return () => {
      poseTracker.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cameraMode = screen === 'calibrating' ? 'full' : screen === 'start' ? 'hidden' : 'mini';

  return (
    <div className="app">
      {/* Portrait-clamped game frame — the 3D canvas, HUD, and camera preview all
          live inside this shared box so they stay visually locked together instead
          of the HUD pinning to the full (possibly very wide) browser window while
          the canvas letterboxes down to portrait inside it. */}
      <div className="game-frame">
        {/* Always mounted camera preview */}
        <CameraPreview videoRef={videoRef} debug={debug} mode={cameraMode} />

        <AnimatePresence mode="wait">
          {screen === 'start' && (
            <StartScreen
              key="start"
              onStart={handlePlayTap}
              onViewLeaderboard={openLeaderboard}
              onSignOut={() => void signOut()}
              user={user}
              error={error}
              loading={loading}
            />
          )}

          {screen === 'signing-in' && (
            <SignInScreen
              key="signing-in"
              onSignIn={() => void handleSignIn()}
              onBack={() => setScreen('start')}
              error={signInError}
              loading={signingIn || loading}
            />
          )}

          {screen === 'leaderboard' && (
            <LeaderboardScreen key="leaderboard" currentUser={user} onBack={closeLeaderboard} />
          )}

          {screen === 'calibrating' && (
            <CalibrationScreen key="calibrating" debug={debug} onDone={handleCalibrationDone} />
          )}

          {(screen === 'playing' || screen === 'gameover') && (
            <div key="play" className="play-area">
              <GameCanvas engine={engine} />
              <HUD
                stats={snapshot.stats}
                debug={debug}
                onTogglePause={handleTogglePause}
                isPaused={snapshot.status === 'paused'}
              />

              {snapshot.status === 'paused' && (
                <motion.div
                  className="screen overlay pause-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <h2 className="title">GAME PAUSED</h2>
                  <p className="subtitle">Take a breather! Resume when you're ready.</p>
                  <button className="primary-btn" onClick={handleTogglePause}>
                    <Play size={20} /> RESUME GAME
                  </button>
                </motion.div>
              )}

              {screen === 'gameover' && (
                <GameOverScreen
                  stats={snapshot.stats}
                  reason={engine.getGameOverReason()}
                  rank={rank}
                  onRestart={handleRestart}
                  onViewLeaderboard={openLeaderboard}
                />
              )}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
