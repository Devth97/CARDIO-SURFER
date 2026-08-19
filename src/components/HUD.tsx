import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Volume2,
  VolumeX,
  Pause,
  Play,
  Shield,
  Magnet,
  Star,
  Coins,
  ArrowDown,
  AlertTriangle,
  Activity,
  Hand,
} from 'lucide-react';
import type { GameStats } from '../game/types';
import type { PoseDebugState } from '../pose/PoseTracker';
import { soundManager } from '../game/SoundManager';

interface Props {
  stats: GameStats;
  debug: PoseDebugState | null;
  onTogglePause?: () => void;
  isPaused?: boolean;
}

export default function HUD({ stats, debug, onTogglePause, isPaused }: Props) {
  const [muted, setMuted] = useState(soundManager.isMuted());

  const toggleSound = () => {
    const isMutedNow = soundManager.toggleMute();
    setMuted(isMutedNow);
  };

  const { activePowerUps } = stats;

  const isDucking = debug?.duckActive ?? false;
  const rightHand = debug?.rightHandRaised ?? false;
  const leftHand = debug?.leftHandRaised ?? false;

  let poseBadge = { label: 'RUNNING', color: 'teal', icon: <Activity size={14} /> };
  if (isDucking) {
    // Badge must track duckActive alone (the same flag that actually fires
    // DUCK_START) — it previously also lit up at drop > 0.08, a lower bar
    // than DUCK_DROP_RATIO (0.16) that actually triggers the game action, so
    // a moderate squat between 8-16% showed "DUCKING" here while the
    // character never reacted. Misleading, not just cosmetic.
    poseBadge = { label: 'DUCKING', color: 'amber', icon: <ArrowDown size={14} /> };
  } else if (rightHand) {
    poseBadge = { label: 'RIGHT HAND (LANE RIGHT)', color: 'purple', icon: <Hand size={14} /> };
  } else if (leftHand) {
    poseBadge = { label: 'LEFT HAND (LANE LEFT)', color: 'purple', icon: <Hand size={14} /> };
  }

  // Format score with leading zeroes (e.g. 000041) like Image 2 Reference
  const formattedScore = String(Math.floor(stats.score)).padStart(6, '0');
  const multiplier = activePowerUps.star ? 2 : 1;

  return (
    <div className="hud-subway-wrapper">
      {/* Top Left Pause & Sound Buttons (Image 2) */}
      <div className="hud-top-left">
        {onTogglePause && (
          <button className="subway-pause-btn" onClick={onTogglePause} title="Pause Game (P)">
            {isPaused ? <Play size={22} fill="#fff" /> : <Pause size={22} fill="#fff" />}
          </button>
        )}
        <button className="subway-sound-btn" onClick={toggleSound} title={muted ? 'Unmute' : 'Mute'}>
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {/* Top Right Score & Coin Displays (Image 2 Reference) */}
      <div className="hud-top-right">
        {/* Black Container with x1 Multiplier & Score */}
        <div className="subway-score-box">
          <span className="subway-multiplier">x{multiplier}</span>
          <span className="subway-score-num">{formattedScore}</span>
        </div>

        {/* Black Coin Pill Container */}
        <div className="subway-coin-box">
          <span className="subway-coin-num">{stats.coins}</span>
          <Coins size={18} className="gold-coin-icon" />
        </div>
      </div>

      {/* Real-time Pose Status Indicator Badge */}
      {debug?.tracking && (
        <div className={`hud-pose-badge ${poseBadge.color}`}>
          {poseBadge.icon} {poseBadge.label}
        </div>
      )}


      {/* Power-Ups bar */}
      <div className="hud-powerups">
        <AnimatePresence>
          {activePowerUps.shield && (
            <motion.div
              className="powerup-badge shield"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <Shield size={14} /> SHIELD READY
            </motion.div>
          )}
          {activePowerUps.magnet && (
            <motion.div
              className="powerup-badge magnet"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <Magnet size={14} /> MAGNET {activePowerUps.magnetTimeLeft}s
            </motion.div>
          )}
          {activePowerUps.star && (
            <motion.div
              className="powerup-badge star"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <Star size={14} /> 2x SCORE {activePowerUps.starTimeLeft}s
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {debug && !debug.tracking && (
        <motion.div
          className="hud-warning"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AlertTriangle size={15} /> Tracking lost — step into camera frame
        </motion.div>
      )}
    </div>
  );
}
