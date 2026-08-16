export interface Env {
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGIN: string;
}

export interface VerifiedUser {
  uid: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface RunSubmission {
  score: number;
  calories: number;
  durationSec: number;
}

export interface LeaderboardRow {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  score: number;
}

export interface HistoryRow {
  id: number;
  score: number;
  calories: number;
  durationSec: number;
  createdAt: string;
}
