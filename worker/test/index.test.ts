import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { insertRun, upsertUser } from '../src/db';

beforeEach(async () => {
  await env.DB.exec('DELETE FROM runs');
  await env.DB.exec('DELETE FROM users');
});

describe('CORS preflight', () => {
  it('responds to OPTIONS with the configured allowed origin', async () => {
    const response = await SELF.fetch('https://worker.example/runs', { method: 'OPTIONS' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(env.ALLOWED_ORIGIN);
  });
});

describe('unknown routes', () => {
  it('returns 404 for an unmatched path', async () => {
    const response = await SELF.fetch('https://worker.example/nope');
    expect(response.status).toBe(404);
  });
});

describe('GET /leaderboard', () => {
  it('is public and returns an empty list when no runs exist', async () => {
    const response = await SELF.fetch('https://worker.example/leaderboard?scope=alltime');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ scope: 'alltime', entries: [] });
  });

  it('defaults to weekly scope when none is given', async () => {
    const response = await SELF.fetch('https://worker.example/leaderboard');
    const body = await response.json();
    expect(body).toMatchObject({ scope: 'weekly' });
  });

  it('clamps a negative limit to a positive floor instead of returning every row unbounded', async () => {
    for (const uid of ['uid-1', 'uid-2', 'uid-3']) {
      await upsertUser(env.DB, uid, uid, null);
      await insertRun(env.DB, { uid, score: 100, calories: 10, durationSec: 60, weekId: '2026-W33' });
    }

    const response = await SELF.fetch('https://worker.example/leaderboard?scope=alltime&limit=-1');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { entries: unknown[] };
    // A negative LIMIT is unbounded in SQLite; without clamping this would
    // return all 3 rows instead of being capped to a sane positive floor.
    expect(body.entries.length).toBeLessThan(3);
  });

  it('falls back to the default limit when limit=0 is given', async () => {
    for (const uid of ['uid-1', 'uid-2', 'uid-3']) {
      await upsertUser(env.DB, uid, uid, null);
      await insertRun(env.DB, { uid, score: 100, calories: 10, durationSec: 60, weekId: '2026-W33' });
    }

    const response = await SELF.fetch('https://worker.example/leaderboard?scope=alltime&limit=0');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { entries: unknown[] };
    expect(body.entries.length).toBe(3);
  });
});

describe('authenticated routes without a token', () => {
  it('rejects POST /runs with 401', async () => {
    const response = await SELF.fetch('https://worker.example/runs', {
      method: 'POST',
      body: JSON.stringify({ score: 10, calories: 1, durationSec: 10 }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects GET /me/history with 401', async () => {
    const response = await SELF.fetch('https://worker.example/me/history');
    expect(response.status).toBe(401);
  });
});
