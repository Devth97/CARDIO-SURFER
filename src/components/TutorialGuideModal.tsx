import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUp,
  ArrowDown,
  Keyboard,
  Shield,
  Magnet,
  Star,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  Hand,
} from 'lucide-react';

interface Props {
  onClose: () => void;
}

export default function TutorialGuideModal({ onClose }: Props) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: 'WELCOME TO CARDIO SURFER!',
      subtitle: 'An endless runner where YOUR HANDS & BODY control the player.',
      content: (
        <div className="tutorial-page">
          <div className="tutorial-icon-hero">
            <Hand size={48} className="purple" />
          </div>
          <p className="tutorial-desc">
            Raise your right or left hand in front of the camera to change lanes, jump and squat to dodge obstacles!
          </p>
          <div className="tutorial-tips-card">
            <div className="tip-row">
              <CheckCircle2 size={18} className="teal" /> Stand 4-6 feet back from camera
            </div>
            <div className="tip-row">
              <CheckCircle2 size={18} className="teal" /> Good lighting facing your face & hands
            </div>
            <div className="tip-row">
              <CheckCircle2 size={18} className="teal" /> Head & shoulders clearly in frame
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'HAND-RAISE STEERING & GESTURES',
      subtitle: 'Control lane shifts with your hands and dodge obstacles with your body:',
      content: (
        <div className="tutorial-page">
          <div className="tutorial-gestures-grid">
            <div className="gesture-card purple">
              <div className="gesture-card-header">
                <Hand size={22} /> RAISE RIGHT / LEFT HAND
              </div>
              <p>Lift Right Hand above shoulder ➔ Move 1 Lane Right. Lift twice ➔ Move 2 Lanes Right! Lift Left Hand ➔ Move Left.</p>
            </div>

            <div className="gesture-card teal">
              <div className="gesture-card-header">
                <ArrowUp size={22} /> JUMP OVER LOW HURDLES
              </div>
              <p>Hop or jump in place. High sensitivity triggers a jump arc over low red barriers.</p>
            </div>

            <div className="gesture-card amber">
              <div className="gesture-card-header">
                <ArrowDown size={22} /> SQUAT / DUCK UNDER LASERS
              </div>
              <p>Squat down to duck under yellow overhead laser beams.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'POWER-UPS & FALLBACK CONTROLS',
      subtitle: 'Collect power-ups and use keyboard / touch controls whenever needed!',
      content: (
        <div className="tutorial-page">
          <div className="tutorial-powerups-list">
            <div className="powerup-info-row shield">
              <Shield size={20} /> <strong>SHIELD</strong>: Protects you from 1 obstacle hit.
            </div>
            <div className="powerup-info-row magnet">
              <Magnet size={20} /> <strong>MAGNET</strong>: Attracts nearby coins into your lane.
            </div>
            <div className="powerup-info-row star">
              <Star size={20} /> <strong>2x SCORE</strong>: Doublings points earned for 8 seconds.
            </div>
          </div>

          <div className="tutorial-fallback-card">
            <div className="fallback-header">
              <Keyboard size={20} /> MANUAL TESTING FALLBACK
            </div>
            <p>
              If your camera is off or lighting is low, use <strong>Arrow Keys (↑ ↓ ← →)</strong>, <strong>Spacebar</strong>, or <strong>Mobile Swipe Gestures</strong> to test anytime!
            </p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <motion.div
      className="tutorial-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="tutorial-modal-card"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <button className="tutorial-close-btn" onClick={onClose} title="Close Tutorial">
          <X size={20} />
        </button>

        <div className="tutorial-header">
          <div className="tutorial-badge">
            HOW TO PLAY ({step + 1}/{steps.length})
          </div>
          <h2 className="tutorial-title">{steps[step].title}</h2>
          <p className="tutorial-subtitle">{steps[step].subtitle}</p>
        </div>

        <div className="tutorial-body">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {steps[step].content}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="tutorial-footer">
          <div className="tutorial-dots">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`dot ${i === step ? 'active' : ''}`}
                onClick={() => setStep(i)}
              />
            ))}
          </div>

          <div className="tutorial-buttons">
            {step > 0 && (
              <button className="tutorial-btn secondary" onClick={() => setStep(step - 1)}>
                <ChevronLeft size={18} /> BACK
              </button>
            )}
            {step < steps.length - 1 ? (
              <button className="tutorial-btn primary" onClick={() => setStep(step + 1)}>
                NEXT <ChevronRight size={18} />
              </button>
            ) : (
              <button className="tutorial-btn primary pulse" onClick={onClose}>
                <CheckCircle2 size={18} /> GOT IT! START PLAYING
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
