import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Activity,
  Sparkles,
  Hand,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import type { PoseDebugState } from '../pose/PoseTracker';
import { soundManager } from '../game/SoundManager';

interface Props {
  debug: PoseDebugState | null;
  onDone: () => void;
}

const COUNTDOWN_START = 2; // 2 seconds hold for 180° T-Pose calibration

export default function CalibrationScreen({ debug, onDone }: Props) {
  const [phase, setPhase] = useState<'practice' | 'tpose'>('practice');
  const [testedMoves, setTestedMoves] = useState({
    rightHand: false,
    leftHand: false,
    jump: false,
    duck: false,
  });

  const [count, setCount] = useState<number | null>(null);

  // Monitor live gesture triggers during practice phase
  useEffect(() => {
    if (phase !== 'practice' || !debug?.tracking) return;

    if (debug.rightHandRaised && !testedMoves.rightHand) {
      setTestedMoves((prev) => ({ ...prev, rightHand: true }));
      soundManager.playMove();
    }
    if (debug.leftHandRaised && !testedMoves.leftHand) {
      setTestedMoves((prev) => ({ ...prev, leftHand: true }));
      soundManager.playMove();
    }
    if (debug.dropRatio < -0.06 && !testedMoves.jump) {
      // Standing on toes / jumping upward
      setTestedMoves((prev) => ({ ...prev, jump: true }));
      soundManager.playJump();
    }
    if ((debug.duckActive || debug.dropRatio > 0.08) && !testedMoves.duck) {
      // Squatting / ducking
      setTestedMoves((prev) => ({ ...prev, duck: true }));
      soundManager.playDuck();
    }
  }, [debug, phase, testedMoves]);

  // 180° T-Pose Countdown Logic
  const tPoseActive = debug?.tPoseDetected && debug?.tracking;

  useEffect(() => {
    if (phase !== 'tpose' || !tPoseActive) {
      setCount(null);
      return;
    }
    if (count === null) {
      setCount(COUNTDOWN_START);
    }
  }, [tPoseActive, count, phase]);

  useEffect(() => {
    if (phase !== 'tpose' || count === null || !tPoseActive) return;
    if (count <= 0) {
      onDone();
      return;
    }
    const t = setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [count, tPoseActive, phase, onDone]);

  const allPracticeDone =
    testedMoves.rightHand && testedMoves.leftHand && testedMoves.jump && testedMoves.duck;

  return (
    <motion.div
      className="screen calibration-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <AnimatePresence mode="wait">
        {phase === 'practice' ? (
          <motion.div
            key="practice-stage"
            className="calibration-box practice-box"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="tpose-badge purple">
              <Sparkles size={14} /> STEP 1: INTERACTIVE MOTION PRACTICE
            </div>

            <h2 className="title small">PRACTICE YOUR MOVES LIVE</h2>
            <p className="subtitle">
              Try raising your hands, standing on toes, and squatting below to test live camera detection!
            </p>

            <div className="practice-cards-grid">
              <div className={`practice-card ${testedMoves.rightHand ? 'active' : ''}`}>
                <div className="practice-card-header">
                  <Hand size={20} className="purple" /> RAISE RIGHT HAND
                </div>
                <div className="practice-card-status">
                  {testedMoves.rightHand ? (
                    <span className="tested-text">
                      <CheckCircle2 size={16} /> MOVE RIGHT READY
                    </span>
                  ) : (
                    <span className="untested-text">Raise Right Hand ➔</span>
                  )}
                </div>
              </div>

              <div className={`practice-card ${testedMoves.leftHand ? 'active' : ''}`}>
                <div className="practice-card-header">
                  <Hand size={20} className="purple" /> RAISE LEFT HAND
                </div>
                <div className="practice-card-status">
                  {testedMoves.leftHand ? (
                    <span className="tested-text">
                      <CheckCircle2 size={16} /> MOVE LEFT READY
                    </span>
                  ) : (
                    <span className="untested-text">Raise Left Hand ➔</span>
                  )}
                </div>
              </div>

              <div className={`practice-card ${testedMoves.jump ? 'active' : ''}`}>
                <div className="practice-card-header">
                  <ArrowUp size={20} className="teal" /> STAND ON TOES / JUMP
                </div>
                <div className="practice-card-status">
                  {testedMoves.jump ? (
                    <span className="tested-text">
                      <CheckCircle2 size={16} /> JUMP READY
                    </span>
                  ) : (
                    <span className="untested-text">Stand on Toes ➔</span>
                  )}
                </div>
              </div>

              <div className={`practice-card ${testedMoves.duck ? 'active' : ''}`}>
                <div className="practice-card-header">
                  <ArrowDown size={20} className="amber" /> SQUAT / DUCK
                </div>
                <div className="practice-card-status">
                  {testedMoves.duck ? (
                    <span className="tested-text">
                      <CheckCircle2 size={16} /> DUCK READY
                    </span>
                  ) : (
                    <span className="untested-text">Squat Down ➔</span>
                  )}
                </div>
              </div>
            </div>

            <button
              className={`primary-btn ${allPracticeDone ? 'pulse' : ''}`}
              onClick={() => setPhase('tpose')}
            >
              VERIFY 180° STANDING POSTURE <ArrowRight size={18} />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="tpose-stage"
            className="calibration-box tpose-enhanced-box"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="tpose-badge">
              <Sparkles size={14} /> STEP 2: 180° ARMS BASELINE VERIFICATION
            </div>

            <h2 className="title small">STAND STILL & EXTEND ARMS AT 180°</h2>

            <p className="subtitle">
              Stand upright and stretch both arms straight out horizontally at 180° (T-Pose) for 2 seconds to lock baseline height.
            </p>

            {/* Nanobanana Generated High-Quality Graphic Art */}
            <div className={`tpose-hero-graphic-wrap ${tPoseActive ? 'detected' : ''}`}>
              <img
                src="/tpose_guide.jpg"
                alt="180° T-Pose Calibration Graphic"
                className="tpose-hero-img"
              />
              <div className="tpose-hero-laser-overlay" />
              <div className="angle-tag-badge">180° HORIZONTAL T-POSE</div>
            </div>

            <div className="calibration-status">
              {!debug?.tracking && (
                <span className="warning-text">
                  <Activity className="spin" size={18} /> Searching for body pose…
                </span>
              )}

              {debug?.tracking && !tPoseActive && (
                <span className="warning-text">
                  <ShieldAlert size={18} /> Hold both arms straight out horizontally (180°)
                </span>
              )}

              {tPoseActive && count !== null && count > 0 && (
                <span className="countdown">
                  ✨ 180° T-POSE DETECTED! HOLD STILL… {count}s
                </span>
              )}

              {tPoseActive && count === 0 && (
                <span className="success-text">
                  <CheckCircle2 size={20} /> STANDING POSTURE LOCKED!
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
