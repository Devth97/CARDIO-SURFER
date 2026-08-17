export interface RunSubmission {
  score: number;
  calories: number;
  durationSec: number;
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  score: number;
}

export interface LeaderboardResponse {
  scope: 'weekly' | 'alltime';
  entries: LeaderboardEntry[];
}

export interface HistoryEntry {
  id: number;
  score: number;
  calories: number;
  durationSec: number;
  createdAt: string;
}

export interface HistoryResponse {
  entries: HistoryEntry[];
}

export type SubmitRunResult = { ok: true } | { ok: false; error: string };
