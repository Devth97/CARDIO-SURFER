import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Volume2,
  VolumeX,
  ArrowUp,
  ArrowDown,
  Camera,
  Activity,
  HelpCircle,
  Hand,
  LogOut,
} from 'lucide-react';
import { soundManager } from '../game/SoundManager';
import TutorialGuideModal from './TutorialGuideModal';
import AdBanner from './AdBanner';

interface StartScreenUser {
  displayName: string | null;
  photoURL: string | null;
}

interface Props {
  onStart: () => void;
  onViewLeaderboard: () => void;
  onSignOut: () => void;
  user: StartScreenUser | null;
  error: string | null;
  loading: boolean;
}

export default function StartScreen({
  onStart,
  onViewLeaderboard,
  onSignOut,
  user,
  error,
  loading,
}: Props) {
  const [muted, setMuted] = useState(soundManager.isMuted());
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem('cardio_surfer_tutorial_seen');
    if (!seen) {
      setShowTutorial(true);
    }
  }, []);

  const handleCloseTutorial = () => {
    localStorage.setItem('cardio_surfer_tutorial_seen', 'true');
    setShowTutorial(false);
  };

  const toggleSound = () => {
    const isMutedNow = soundManager.toggleMute();
    setMuted(isMutedNow);
  };

  const highScore = parseInt(localStorage.getItem('cardio_surfer_high_score') || '0', 10);

  return (
    <motion.div
      className="screen start-screen"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4 }}
    >
      {user && (
        <div className="player-badge">
          {user.photoURL ? (
            <img src={user.photoURL} alt="" className="player-badge-avatar" />
          ) : (
            <span className="player-badge-avatar placeholder" />
          )}
          <span className="player-badge-name">{user.displayName ?? 'Player'}</span>
          <button className="player-badge-signout" onClick={onSignOut} title="Sign out">
            <LogOut size={14} />
          </button>
        </div>
      )}

      <motion.div
        className="logo-container"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.5 }}
      >
        <img src="/logo.jpg" alt="Cardio Surfer Logo" className="app-logo-img" />
      </motion.div>

      <motion.h1
        className="title"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        CARDIO SURFER
      </motion.h1>

      <motion.p
        className="subtitle"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
      >
        The 3-Lane Hand-Steered Endless Runner. Raise right/left hand to switch lanes, jump and squat to dodge!
      </motion.p>

      {highScore > 0 && (
        <motion.div
          className="high-score-badge"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Trophy className="badge-icon gold" size={16} /> BEST SCORE: <span>{highScore}</span>
        </motion.div>
      )}

      <motion.div
        className="rules-card"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35 }}
      >
        <div className="rule-item">
          <div className="rule-icon purple">
            <Hand size={20} />
          </div>
          <div>
            <strong>Raise Right / Left Hand</strong> to shift 1 lane right or left (lift twice = 2 lanes!)
          </div>
        </div>
        <div className="rule-item">
          <div className="rule-icon teal">
            <ArrowUp size={20} />
          </div>
          <div>
            <strong>Jump in place</strong> over low obstacle hurdles
          </div>
        </div>
        <div className="rule-item">
          <div className="rule-icon amber">
            <ArrowDown size={20} />
          </div>
          <div>
            <strong>Squat / Duck down</strong> under overhead lasers
          </div>
        </div>
      </motion.div>

      {error && (
        <motion.p className="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {error}
        </motion.p>
      )}

      <motion.div
        className="actions-row"
        initial={{ y: 15, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <button className="primary-btn pulse" onClick={onStart} disabled={loading}>
          {loading ? (
            <>
              <Activity className="spin" size={18} /> Loading Pose Model…
            </>
          ) : (
            <>
              <Camera size={20} /> ENABLE CAMERA & PLAY
            </>
          )}
        </button>

        <button className="icon-btn" onClick={onViewLeaderboard} title="Leaderboard">
          <Trophy size={20} />
        </button>

        <button
          className="icon-btn"
          onClick={() => setShowTutorial(true)}
          title="How to Play Tutorial Guide"
        >
          <HelpCircle size={20} />
        </button>

        <button
          className="icon-btn"
          onClick={toggleSound}
          title={muted ? 'Unmute Audio' : 'Mute Audio'}
        >
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </motion.div>

      <p className="hint">
        💡 Keyboard arrows (↑ ↓ ← →) & Space bar also work as manual fallback!
      </p>

      <AdBanner />

      {/* First-time Tutorial Modal */}
      <AnimatePresence>
        {showTutorial && <TutorialGuideModal onClose={handleCloseTutorial} />}
      </AnimatePresence>
    </motion.div>
  );
}
