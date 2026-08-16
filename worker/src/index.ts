import { verifyFirebaseToken } from './auth';
import { getLeaderboardRoute, getMyHistoryRoute, submitRunRoute, syncUserRoute } from './routes';
import type { Env } from './types';

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  };
}

function json(data: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

async function requireUser(request: Request, env: Env) {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) {
    throw json({ error: 'missing bearer token' }, 401, env.ALLOWED_ORIGIN);
  }
  try {
    return await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
  } catch {
    throw json({ error: 'invalid token' }, 401, env.ALLOWED_ORIGIN);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders(env.ALLOWED_ORIGIN) });
    }

    try {
      if (url.pathname === '/users/sync' && request.method === 'POST') {
        const user = await requireUser(request, env);
        const result = await syncUserRoute(env, user);
        return json(result, 200, env.ALLOWED_ORIGIN);
      }

      if (url.pathname === '/runs' && request.method === 'POST') {
        const user = await requireUser(request, env);
        const body = await request.json<{ score: number; calories: number; durationSec: number }>();
        const result = await submitRunRoute(env, user, body);
        return json(result, result.ok ? 200 : 400, env.ALLOWED_ORIGIN);
      }

      if (url.pathname === '/leaderboard' && request.method === 'GET') {
        const scope = url.searchParams.get('scope') === 'alltime' ? 'alltime' : 'weekly';
        const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
        const result = await getLeaderboardRoute(env, scope, limit);
        return json(result, 200, env.ALLOWED_ORIGIN);
      }

      if (url.pathname === '/me/history' && request.method === 'GET') {
        const user = await requireUser(request, env);
        const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
        const result = await getMyHistoryRoute(env, user.uid, limit);
        return json(result, 200, env.ALLOWED_ORIGIN);
      }

      return json({ error: 'not found' }, 404, env.ALLOWED_ORIGIN);
    } catch (err) {
      if (err instanceof Response) return err;
      console.error(err);
      return json({ error: 'internal error' }, 500, env.ALLOWED_ORIGIN);
    }
  },
} satisfies ExportedHandler<Env>;
