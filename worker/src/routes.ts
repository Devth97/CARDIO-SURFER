import { getLeaderboard, getUserHistory, insertRun, upsertUser } from './db';
import { isPlausibleRun } from './plausibility';
import type { Env, RunSubmission, VerifiedUser } from './types';
import { isoWeekId } from './weekId';

export async function syncUserRoute(env: Env, user: VerifiedUser): Promise<{ ok: true }> {
  await upsertUser(env.DB, user.uid, user.displayName ?? 'Player', user.avatarUrl);
  return { ok: true };
}

// Defensively upserts the caller's user row before inserting the run,
// rather than assuming `/users/sync` (syncUserRoute) already ran for this
// uid. `runs.uid` is `NOT NULL REFERENCES users(uid)`; without this, a
// client that calls submit-run without a prior successful sync (dropped
// request, client bug, race, ...) would hit an FK violation or, if FK
// enforcement isn't strictly on, silently create an orphaned run row with
// no matching user. `upsertUser` is idempotent (`ON CONFLICT DO UPDATE`),
// so calling it here is cheap/safe even when the user already synced.
export async function submitRunRoute(
  env: Env,
  user: VerifiedUser,
  submission: RunSubmission,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPlausibleRun(submission)) {
    return { ok: false, error: 'implausible run' };
  }
  await upsertUser(env.DB, user.uid, user.displayName ?? 'Player', user.avatarUrl);
  await insertRun(env.DB, {
    uid: user.uid,
    score: submission.score,
    calories: submission.calories,
    durationSec: submission.durationSec,
    weekId: isoWeekId(new Date()),
  });
  return { ok: true };
}

export async function getLeaderboardRoute(env: Env, scope: 'weekly' | 'alltime', limit: number) {
  const entries = await getLeaderboard(env.DB, scope, isoWeekId(new Date()), limit);
  return { scope, entries };
}

export async function getMyHistoryRoute(env: Env, uid: string, limit: number) {
  const entries = await getUserHistory(env.DB, uid, limit);
  return { entries };
}
