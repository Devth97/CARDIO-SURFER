import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

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
