import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play } from 'lucide-react';
import './App.css';
import { GameEngine } from './game/GameEngine';
import { PoseTracker, type PoseDebugState } from './pose/PoseTracker';
import StartScreen from './components/StartScreen';
import CalibrationScreen from './components/CalibrationScreen';
import GameCanvas from './components/GameCanvas';
import CameraPreview from './components/CameraPreview';
import HUD from './components/HUD';
import GameOverScreen from './components/GameOverScreen';
import type { GameSnapshot } from './game/types';

type Screen = 'start' | 'calibrating' | 'playing' | 'gameover';

export default function App() {
  const engine = useMemo(() => new GameEngine(), []);
  const poseTracker = useMemo(() => new PoseTracker(), []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [screen, setScreen] = useState<Screen>('start');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<PoseDebugState | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot>({
    status: 'idle',
    stats: engine.getStats(),
  });

  // Subscribe to engine + pose tracker once.
  useEffect(() => {
    const unsubEngine = engine.subscribe((snap) => {
      setSnapshot(snap);
      if (snap.status === 'gameover') setScreen('gameover');
    });
    const unsubDebug = poseTracker.onDebug(setDebug);
    const unsubAction = poseTracker.onAction((action) => engine.handleAction(action));
    return () => {
      unsubEngine();
      unsubDebug();
      unsubAction();
    };
  }, [engine, poseTracker]);

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
    } finally {
      setLoading(false);
    }
  }, [poseTracker]);

  const handleCalibrationDone = useCallback(() => {
    poseTracker.calibrateNow();
    engine.start();
    setScreen('playing');
  }, [engine, poseTracker]);

  const handleRestart = useCallback(() => {
    if (poseTracker.isCalibrated()) {
      engine.start();
      setScreen('playing');
    } else {
      setScreen('calibrating');
    }
  }, [engine, poseTracker]);

  const handleTogglePause = useCallback(() => {
    engine.togglePause();
  }, [engine]);

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
            <StartScreen key="start" onStart={setupCamera} error={error} loading={loading} />
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
                  onRestart={handleRestart}
                />
              )}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
