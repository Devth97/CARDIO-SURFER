import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Sparkles, Hand, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import type { PoseDebugState } from '../pose/PoseTracker';
import { soundManager } from '../game/SoundManager';

interface Props {
  debug: PoseDebugState | null;
  onDone: () => void;
}

export default function CalibrationScreen({ debug, onDone }: Props) {
  const [testedMoves, setTestedMoves] = useState({
    rightHand: false,
    leftHand: false,
    jump: false,
    duck: false,
  });

  // Monitor live gesture triggers during practice phase
  useEffect(() => {
    if (!debug?.tracking) return;

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
  }, [debug, testedMoves]);

  const allPracticeDone =
    testedMoves.rightHand && testedMoves.leftHand && testedMoves.jump && testedMoves.duck;

  return (
    <motion.div
      className="screen calibration-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="calibration-box practice-box"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="tpose-badge purple">
          <Sparkles size={14} /> INTERACTIVE MOTION PRACTICE
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

        <button className={`primary-btn ${allPracticeDone ? 'pulse' : ''}`} onClick={onDone}>
          START PLAYING <ArrowRight size={18} />
        </button>
      </motion.div>
    </motion.div>
  );
}
