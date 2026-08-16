import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { getLeaderboardRoute, getMyHistoryRoute, submitRunRoute, syncUserRoute } from '../src/routes';

const ADA = { uid: 'uid-1', displayName: 'Ada', avatarUrl: null };
const GRACE = { uid: 'uid-2', displayName: 'Grace', avatarUrl: null };

beforeEach(async () => {
  await env.DB.exec('DELETE FROM runs');
  await env.DB.exec('DELETE FROM users');
});

describe('syncUserRoute', () => {
  it('upserts the caller\'s profile', async () => {
    await syncUserRoute(env, ADA);
    const row = await env.DB.prepare('SELECT display_name FROM users WHERE uid = ?1')
      .bind('uid-1')
      .first<{ display_name: string }>();
    expect(row?.display_name).toBe('Ada');
  });

  it('falls back to "Player" when Firebase has no display name', async () => {
    await syncUserRoute(env, { uid: 'uid-1', displayName: null, avatarUrl: null });
    const row = await env.DB.prepare('SELECT display_name FROM users WHERE uid = ?1')
      .bind('uid-1')
      .first<{ display_name: string }>();
    expect(row?.display_name).toBe('Player');
  });
});

describe('submitRunRoute', () => {
  it('inserts a plausible run and reports success', async () => {
    await syncUserRoute(env, ADA);

    const result = await submitRunRoute(env, ADA, { score: 500, calories: 30, durationSec: 60 });

    expect(result).toEqual({ ok: true });
    const row = await env.DB.prepare('SELECT score FROM runs WHERE uid = ?1').bind('uid-1').first<{ score: number }>();
    expect(row?.score).toBe(500);
  });

  it('rejects an implausible run without inserting it', async () => {
    await syncUserRoute(env, ADA);

    const result = await submitRunRoute(env, ADA, { score: 999999, calories: 30, durationSec: 5 });

    expect(result).toEqual({ ok: false, error: 'implausible run' });
    const row = await env.DB.prepare('SELECT COUNT(*) as count FROM runs WHERE uid = ?1')
      .bind('uid-1')
      .first<{ count: number }>();
    expect(row?.count).toBe(0);
  });

  // This is the actual orphan-row/FK scenario the defensive-upsert fix
  // protects against: a client calling submit-run without a prior
  // successful /users/sync call (dropped request, client bug, race, ...).
  it('creates the user row on the fly when the caller never synced first (FK safety)', async () => {
    const neverSynced = {
      uid: 'uid-never-synced',
      displayName: 'Brand New',
      avatarUrl: 'https://example.com/x.png',
    };

    const preRow = await env.DB.prepare('SELECT uid FROM users WHERE uid = ?1')
      .bind('uid-never-synced')
      .first();
    expect(preRow).toBeNull();

    const result = await submitRunRoute(env, neverSynced, { score: 500, calories: 30, durationSec: 60 });

    expect(result).toEqual({ ok: true });

    const userRow = await env.DB.prepare('SELECT display_name, avatar_url FROM users WHERE uid = ?1')
      .bind('uid-never-synced')
      .first<{ display_name: string; avatar_url: string }>();
    expect(userRow).toEqual({ display_name: 'Brand New', avatar_url: 'https://example.com/x.png' });

    const runRow = await env.DB.prepare('SELECT score FROM runs WHERE uid = ?1')
      .bind('uid-never-synced')
      .first<{ score: number }>();
    expect(runRow?.score).toBe(500);
  });

  it('falls back to "Player" for a never-synced uid with no display name', async () => {
    const neverSynced = { uid: 'uid-never-synced-3', displayName: null, avatarUrl: null };

    await submitRunRoute(env, neverSynced, { score: 100, calories: 5, durationSec: 30 });

    const userRow = await env.DB.prepare('SELECT display_name FROM users WHERE uid = ?1')
      .bind('uid-never-synced-3')
      .first<{ display_name: string }>();
    expect(userRow?.display_name).toBe('Player');
  });

  it('does not create a user or run row for a never-synced uid when the run is implausible', async () => {
    const neverSynced = { uid: 'uid-never-synced-4', displayName: 'Someone', avatarUrl: null };

    const result = await submitRunRoute(env, neverSynced, { score: 999999, calories: 30, durationSec: 5 });

    expect(result).toEqual({ ok: false, error: 'implausible run' });

    const userRow = await env.DB.prepare('SELECT uid FROM users WHERE uid = ?1')
      .bind('uid-never-synced-4')
      .first();
    expect(userRow).toBeNull();

    const runRow = await env.DB.prepare('SELECT COUNT(*) as count FROM runs WHERE uid = ?1')
      .bind('uid-never-synced-4')
      .first<{ count: number }>();
    expect(runRow?.count).toBe(0);
  });
});

describe('getLeaderboardRoute', () => {
  it('returns entries for the requested scope', async () => {
    await syncUserRoute(env, ADA);
    await submitRunRoute(env, ADA, { score: 500, calories: 30, durationSec: 60 });

    const result = await getLeaderboardRoute(env, 'alltime', 10);

    expect(result.scope).toBe('alltime');
    expect(result.entries).toEqual([{ uid: 'uid-1', displayName: 'Ada', avatarUrl: null, score: 500 }]);
  });
});

describe('getMyHistoryRoute', () => {
  it('returns only the caller\'s own runs', async () => {
    await syncUserRoute(env, ADA);
    await syncUserRoute(env, GRACE);
    await submitRunRoute(env, ADA, { score: 500, calories: 30, durationSec: 60 });
    await submitRunRoute(env, GRACE, { score: 900, calories: 40, durationSec: 90 });

    const result = await getMyHistoryRoute(env, 'uid-1', 10);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].score).toBe(500);
  });
});
