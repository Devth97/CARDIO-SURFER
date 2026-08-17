import { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Trophy,
  RotateCcw,
  Sparkles,
  Coins,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  Flame,
  HeartPulse,
} from 'lucide-react';
import type { GameStats } from '../game/types';

interface Props {
  stats: GameStats;
  reason: string | null;
  onRestart: () => void;
}

export default function GameOverScreen({ stats, reason, onRestart }: Props) {
  const isNewHigh = Math.floor(stats.score) >= stats.highScore && stats.score > 0;

  useEffect(() => {
    if (isNewHigh) {
      const duration = 2.5 * 1000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 4,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#00f0ff', '#ff00c8', '#ffea00'],
        });
        confetti({
          particleCount: 4,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#00f0ff', '#ff00c8', '#ffea00'],
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }
  }, [isNewHigh]);

  const calories = (stats.caloriesBurnt || 0).toFixed(1);
  const squatCal = (stats.ducks * 0.32).toFixed(1);
  const jumpCal = (stats.jumps * 0.2).toFixed(1);
  const runCal = (stats.distanceM * 0.065).toFixed(1);
  const durationSec = Math.ceil(stats.elapsedMs / 1000);

  return (
    <motion.div
      className="screen overlay game-over-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="game-over-logo-wrap"
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <img src="/logo.png" alt="Cardio Surfer Logo" className="game-over-logo" />
      </motion.div>

      <h1 className="title game-over-title">GAME OVER</h1>

      {isNewHigh ? (
        <motion.div
          className="new-record-banner"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        >
          <Sparkles size={18} /> NEW HIGH SCORE RECORD! <Sparkles size={18} />
        </motion.div>
      ) : (
        reason && <p className="subtitle reason-text">{reason}</p>
      )}

      {/* 🔥 FITNESS & CALORIES BURNED HERO CARD */}
      <motion.div
        className="calories-hero-card"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="calories-hero-header">
          <Flame size={24} className="flame-icon" />
          <span className="calories-val">{calories}</span>
          <span className="calories-unit">kcal BURNED</span>
        </div>
        <div className="calories-subtext">
          <HeartPulse size={14} /> Great workout! Active cardio duration: {durationSec}s
        </div>
      </motion.div>

      <motion.div
        className="stats-card"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="main-score-display">
          <div className="main-score-val">{Math.floor(stats.score)}</div>
          <div className="main-score-lbl">FINAL SCORE</div>
        </div>

        <div className="stats-grid">
          <div>
            <div className="stat-value icon-stat">
              <Trophy size={16} className="gold" /> {stats.highScore}
            </div>
            <div className="stat-label">Best Score</div>
          </div>
          <div>
            <div className="stat-value">📏 {Math.floor(stats.distanceM)}m</div>
            <div className="stat-label">Distance ({runCal} kcal)</div>
          </div>
          <div>
            <div className="stat-value icon-stat">
              <Coins size={16} className="amber" /> {stats.coins}
            </div>
            <div className="stat-label">Coins</div>
          </div>
          <div>
            <div className="stat-value icon-stat">
              <ArrowUp size={16} className="teal" /> {stats.jumps}
            </div>
            <div className="stat-label">Jumps ({jumpCal} kcal)</div>
          </div>
          <div>
            <div className="stat-value icon-stat">
              <ArrowDown size={16} className="pink" /> {stats.ducks}
            </div>
            <div className="stat-label">Squats ({squatCal} kcal)</div>
          </div>
          <div>
            <div className="stat-value icon-stat">
              <ArrowLeftRight size={16} className="purple" /> {stats.laneChanges}
            </div>
            <div className="stat-label">Steps</div>
          </div>
        </div>
      </motion.div>

      <motion.button
        className="primary-btn pulse"
        onClick={onRestart}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <RotateCcw size={20} /> PLAY AGAIN
      </motion.button>
    </motion.div>
  );
}
