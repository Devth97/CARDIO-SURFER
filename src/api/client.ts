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

// The worker returns valid JSON on every path, including errors (e.g. a 500
// gives `{error: 'internal error'}`), so `response.json()` never throws on
// its own. Without this check, an error body would get silently cast to the
// success type. Throwing here gives callers one honest rejected promise for
// any failure — HTTP-level or network-level — that a single `.catch()` can
// handle uniformly.
function assertOk(response: Response): void {
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
}

export async function syncUser(user: User): Promise<void> {
  const response = await fetch(`${apiUrl()}/users/sync`, {
    method: 'POST',
    headers: await authHeader(user),
  });
  assertOk(response);
}

export async function submitRun(user: User, submission: RunSubmission): Promise<SubmitRunResult> {
  const response = await fetch(`${apiUrl()}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader(user)) },
    body: JSON.stringify(submission),
  });
  assertOk(response);
  return response.json() as Promise<SubmitRunResult>;
}

export async function getLeaderboard(
  scope: 'weekly' | 'alltime',
  limit = 50,
): Promise<LeaderboardResponse> {
  const response = await fetch(`${apiUrl()}/leaderboard?scope=${scope}&limit=${limit}`);
  assertOk(response);
  return response.json() as Promise<LeaderboardResponse>;
}

export async function getMyHistory(user: User, limit = 50): Promise<HistoryResponse> {
  const response = await fetch(`${apiUrl()}/me/history?limit=${limit}`, {
    headers: await authHeader(user),
  });
  assertOk(response);
  return response.json() as Promise<HistoryResponse>;
}
