import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, ArrowLeft, RotateCcw } from 'lucide-react';
import type { User } from 'firebase/auth';
import { getLeaderboard } from '../api/client';
import type { LeaderboardEntry } from '../api/types';
import AdBanner from './AdBanner';

interface Props {
  currentUser: User | null;
  onBack: () => void;
}

type Scope = 'weekly' | 'alltime';

export default function LeaderboardScreen({ currentUser, onBack }: Props) {
  const [scope, setScope] = useState<Scope>('weekly');
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback((nextScope: Scope) => {
    setEntries(null);
    setError(false);
    getLeaderboard(nextScope)
      .then((response) => setEntries(response.entries))
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load(scope);
  }, [scope, load]);

  return (
    <motion.div
      className="screen leaderboard-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="leaderboard-header">
        <button className="icon-btn" onClick={onBack} title="Back">
          <ArrowLeft size={20} />
        </button>
        <h2 className="title">LEADERBOARD</h2>
      </div>

      <div className="leaderboard-tabs">
        <button
          className={scope === 'weekly' ? 'tab active' : 'tab'}
          onClick={() => setScope('weekly')}
        >
          WEEKLY
        </button>
        <button
          className={scope === 'alltime' ? 'tab active' : 'tab'}
          onClick={() => setScope('alltime')}
        >
          ALL-TIME
        </button>
      </div>

      {error && (
        <div className="leaderboard-error">
          <p>Couldn't load leaderboard.</p>
          <button className="primary-btn" onClick={() => load(scope)}>
            <RotateCcw size={16} /> Retry
          </button>
        </div>
      )}

      {!error && entries === null && <p className="subtitle">Loading…</p>}

      {!error && entries !== null && (
        <div className="leaderboard-list">
          {entries.length === 0 && <p className="subtitle">No runs yet — be the first!</p>}
          {entries.map((entry, index) => (
            <div
              key={entry.uid}
              className={entry.uid === currentUser?.uid ? 'leaderboard-row you' : 'leaderboard-row'}
            >
              <span className="leaderboard-rank">{index + 1}</span>
              {entry.avatarUrl ? (
                <img src={entry.avatarUrl} alt="" className="leaderboard-avatar" />
              ) : (
                <span className="leaderboard-avatar placeholder" />
              )}
              <span className="leaderboard-name">
                {entry.uid === currentUser?.uid ? 'You' : entry.displayName}
              </span>
              <span className="leaderboard-score">
                <Trophy size={14} /> {entry.score}
              </span>
            </div>
          ))}
        </div>
      )}

      <AdBanner />
    </motion.div>
  );
}
