import { motion } from 'framer-motion';
import { LogIn, Activity } from 'lucide-react';

interface Props {
  onSignIn: () => void;
  onBack: () => void;
  error: string | null;
  loading: boolean;
}

export default function SignInScreen({ onSignIn, onBack, error, loading }: Props) {
  return (
    <motion.div
      className="screen sign-in-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <h1 className="title">CARDIO SURFER</h1>
      <p className="subtitle">Connect your Google account to start playing and track your scores.</p>

      {error && <p className="error">{error}</p>}

      <button className="primary-btn pulse" onClick={onSignIn} disabled={loading}>
        {loading ? (
          <>
            <Activity className="spin" size={18} /> Signing In…
          </>
        ) : (
          <>
            <LogIn size={20} /> Sign in with Google
          </>
        )}
      </button>

      {!loading && (
        <button className="text-link" onClick={onBack}>
          ← Back
        </button>
      )}
    </motion.div>
  );
}
