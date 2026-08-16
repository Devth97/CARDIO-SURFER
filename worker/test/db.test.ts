import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { getLeaderboard, getUserHistory, insertRun, upsertUser } from '../src/db';

beforeEach(async () => {
  await env.DB.exec('DELETE FROM runs');
  await env.DB.exec('DELETE FROM users');
});

describe('upsertUser', () => {
  it('creates a new user and updates it on conflict', async () => {
    await upsertUser(env.DB, 'uid-1', 'Ada', 'https://example.com/a.png');
    await upsertUser(env.DB, 'uid-1', 'Ada Lovelace', 'https://example.com/b.png');

    const row = await env.DB.prepare('SELECT display_name, avatar_url FROM users WHERE uid = ?1')
      .bind('uid-1')
      .first<{ display_name: string; avatar_url: string }>();

    expect(row).toEqual({ display_name: 'Ada Lovelace', avatar_url: 'https://example.com/b.png' });
  });
});

describe('insertRun and getLeaderboard', () => {
  it('ranks players by best score within scope, ignoring lower repeat scores', async () => {
    await upsertUser(env.DB, 'uid-1', 'Ada', null);
    await upsertUser(env.DB, 'uid-2', 'Grace', null);

    await insertRun(env.DB, { uid: 'uid-1', score: 100, calories: 10, durationSec: 60, weekId: '2026-W33' });
    await insertRun(env.DB, { uid: 'uid-1', score: 300, calories: 20, durationSec: 90, weekId: '2026-W33' });
    await insertRun(env.DB, { uid: 'uid-2', score: 200, calories: 15, durationSec: 70, weekId: '2026-W33' });
    await insertRun(env.DB, { uid: 'uid-2', score: 900, calories: 30, durationSec: 100, weekId: '2026-W32' });

    const weekly = await getLeaderboard(env.DB, 'weekly', '2026-W33', 10);
    expect(weekly).toEqual([
      { uid: 'uid-1', displayName: 'Ada', avatarUrl: null, score: 300 },
      { uid: 'uid-2', displayName: 'Grace', avatarUrl: null, score: 200 },
    ]);

    const alltime = await getLeaderboard(env.DB, 'alltime', '2026-W33', 10);
    expect(alltime).toEqual([
      { uid: 'uid-2', displayName: 'Grace', avatarUrl: null, score: 900 },
      { uid: 'uid-1', displayName: 'Ada', avatarUrl: null, score: 300 },
    ]);
  });

  it('respects the limit', async () => {
    await upsertUser(env.DB, 'uid-1', 'Ada', null);
    await upsertUser(env.DB, 'uid-2', 'Grace', null);
    await insertRun(env.DB, { uid: 'uid-1', score: 100, calories: 10, durationSec: 60, weekId: '2026-W33' });
    await insertRun(env.DB, { uid: 'uid-2', score: 200, calories: 10, durationSec: 60, weekId: '2026-W33' });

    const top1 = await getLeaderboard(env.DB, 'weekly', '2026-W33', 1);
    expect(top1).toEqual([{ uid: 'uid-2', displayName: 'Grace', avatarUrl: null, score: 200 }]);
  });
});

describe('getUserHistory', () => {
  it('returns a user\'s runs, most recent first', async () => {
    await upsertUser(env.DB, 'uid-1', 'Ada', null);
    await insertRun(env.DB, { uid: 'uid-1', score: 100, calories: 10, durationSec: 60, weekId: '2026-W33' });
    await insertRun(env.DB, { uid: 'uid-1', score: 150, calories: 12, durationSec: 65, weekId: '2026-W33' });

    const history = await getUserHistory(env.DB, 'uid-1', 10);

    expect(history).toHaveLength(2);
    expect(history[0].score).toBe(150);
    expect(history[1].score).toBe(100);
  });

  it('only returns runs for the requested user', async () => {
    await upsertUser(env.DB, 'uid-1', 'Ada', null);
    await upsertUser(env.DB, 'uid-2', 'Grace', null);
    await insertRun(env.DB, { uid: 'uid-1', score: 100, calories: 10, durationSec: 60, weekId: '2026-W33' });
    await insertRun(env.DB, { uid: 'uid-2', score: 999, calories: 40, durationSec: 100, weekId: '2026-W33' });

    const history = await getUserHistory(env.DB, 'uid-1', 10);

    expect(history).toHaveLength(1);
    expect(history[0].score).toBe(100);
  });
});
