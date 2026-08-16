import type { HistoryRow, LeaderboardRow } from './types';

export async function upsertUser(
  db: D1Database,
  uid: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (uid, display_name, avatar_url, created_at)
       VALUES (?1, ?2, ?3, datetime('now'))
       ON CONFLICT(uid) DO UPDATE SET display_name = ?2, avatar_url = ?3`,
    )
    .bind(uid, displayName, avatarUrl)
    .run();
}

export async function insertRun(
  db: D1Database,
  params: { uid: string; score: number; calories: number; durationSec: number; weekId: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO runs (uid, score, calories, duration_sec, week_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))`,
    )
    .bind(params.uid, params.score, params.calories, params.durationSec, params.weekId)
    .run();
}

export async function getLeaderboard(
  db: D1Database,
  scope: 'weekly' | 'alltime',
  weekId: string,
  limit: number,
): Promise<LeaderboardRow[]> {
  const statement =
    scope === 'weekly'
      ? db
          .prepare(
            `SELECT u.uid as uid, u.display_name as displayName, u.avatar_url as avatarUrl, MAX(r.score) as score
             FROM runs r JOIN users u ON u.uid = r.uid
             WHERE r.week_id = ?1
             GROUP BY r.uid
             ORDER BY score DESC
             LIMIT ?2`,
          )
          .bind(weekId, limit)
      : db
          .prepare(
            `SELECT u.uid as uid, u.display_name as displayName, u.avatar_url as avatarUrl, MAX(r.score) as score
             FROM runs r JOIN users u ON u.uid = r.uid
             GROUP BY r.uid
             ORDER BY score DESC
             LIMIT ?1`,
          )
          .bind(limit);

  const { results } = await statement.all<LeaderboardRow>();
  return results;
}

export async function getUserHistory(db: D1Database, uid: string, limit: number): Promise<HistoryRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, score, calories, duration_sec as durationSec, created_at as createdAt
       FROM runs
       WHERE uid = ?1
       ORDER BY created_at DESC, id DESC
       LIMIT ?2`,
    )
    .bind(uid, limit)
    .all<HistoryRow>();
  return results;
}
