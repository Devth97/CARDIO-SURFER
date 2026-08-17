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
});
