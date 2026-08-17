// @vitest-environment node
//
// Runs under Node's environment (not jsdom) because this file exercises real
// Web Fetch API globals (`fetch`, `Response`) that jsdom doesn't implement —
// Node 18+ provides them natively, and this file renders no DOM so jsdom
// brings no benefit here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { getLeaderboard, getMyHistory, submitRun, syncUser } from './client';

const fakeUser = {
  getIdToken: vi.fn().mockResolvedValue('fake-id-token'),
} as unknown as User;

describe('API client', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'https://api.test.example');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('syncUser POSTs to /users/sync with a Bearer token', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    await syncUser(fakeUser);

    expect(fetch).toHaveBeenCalledWith('https://api.test.example/users/sync', {
      method: 'POST',
      headers: { Authorization: 'Bearer fake-id-token' },
    });
  });

  it('submitRun POSTs the submission body with a Bearer token and returns the parsed result', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await submitRun(fakeUser, { score: 500, calories: 30, durationSec: 60 });

    expect(fetch).toHaveBeenCalledWith('https://api.test.example/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
      body: JSON.stringify({ score: 500, calories: 30, durationSec: 60 }),
    });
    expect(result).toEqual({ ok: true });
  });

  it('getLeaderboard GETs without an Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ scope: 'weekly', entries: [] }), { status: 200 }),
    );

    const result = await getLeaderboard('weekly', 10);

    expect(fetch).toHaveBeenCalledWith('https://api.test.example/leaderboard?scope=weekly&limit=10');
    expect(result).toEqual({ scope: 'weekly', entries: [] });
  });

  it('getMyHistory GETs with a Bearer token', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ entries: [] }), { status: 200 }));

    await getMyHistory(fakeUser, 5);

    expect(fetch).toHaveBeenCalledWith('https://api.test.example/me/history?limit=5', {
      headers: { Authorization: 'Bearer fake-id-token' },
    });
  });

  // The worker returns valid JSON on error paths too (e.g. a 500 gives
  // `{error: 'internal error'}`), so `response.json()` never throws on its
  // own. Each function must check `response.ok` and reject instead of
  // resolving with that error body cast to the success type.
  describe('non-2xx responses', () => {
    it('syncUser rejects on a non-2xx response', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: 'internal error' }), { status: 500 }),
      );

      await expect(syncUser(fakeUser)).rejects.toThrow('API request failed: 500');
    });

    it('submitRun rejects on a non-2xx response instead of resolving with the error body', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: 'internal error' }), { status: 500 }),
      );

      await expect(submitRun(fakeUser, { score: 500, calories: 30, durationSec: 60 })).rejects.toThrow(
        'API request failed: 500',
      );
    });

    it('getLeaderboard rejects on a non-2xx response instead of resolving with the error body', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: 'internal error' }), { status: 500 }),
      );

      await expect(getLeaderboard('weekly', 10)).rejects.toThrow('API request failed: 500');
    });

    it('getMyHistory rejects on a non-2xx response instead of resolving with the error body', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: 'internal error' }), { status: 404 }),
      );

      await expect(getMyHistory(fakeUser, 5)).rejects.toThrow('API request failed: 404');
    });
  });
});
