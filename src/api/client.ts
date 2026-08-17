import type { User } from 'firebase/auth';
import type {
  HistoryResponse,
  LeaderboardResponse,
  RunSubmission,
  SubmitRunResult,
} from './types';

// Read lazily (not at module scope) so tests can override it per-test via
// vi.stubEnv before each call, instead of depending on Vite's env-file
// loading order relative to this module's first import.
function apiUrl(): string {
  return import.meta.env.VITE_API_URL;
}

async function authHeader(user: User | null): Promise<Record<string, string>> {
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function syncUser(user: User): Promise<void> {
  await fetch(`${apiUrl()}/users/sync`, {
    method: 'POST',
    headers: await authHeader(user),
  });
}

export async function submitRun(user: User, submission: RunSubmission): Promise<SubmitRunResult> {
  const response = await fetch(`${apiUrl()}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader(user)) },
    body: JSON.stringify(submission),
  });
  return response.json() as Promise<SubmitRunResult>;
}

export async function getLeaderboard(
  scope: 'weekly' | 'alltime',
  limit = 50,
): Promise<LeaderboardResponse> {
  const response = await fetch(`${apiUrl()}/leaderboard?scope=${scope}&limit=${limit}`);
  return response.json() as Promise<LeaderboardResponse>;
}

export async function getMyHistory(user: User, limit = 50): Promise<HistoryResponse> {
  const response = await fetch(`${apiUrl()}/me/history?limit=${limit}`, {
    headers: await authHeader(user),
  });
  return response.json() as Promise<HistoryResponse>;
}
