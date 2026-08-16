import type { Env } from './types';

// Placeholder entry-point. wrangler.toml's `main` must resolve to a real
// module for the D1 test harness (and `wrangler dev`/`deploy`) to boot the
// worker. Task 9 replaces this with real routing.
export default {
  async fetch(_request: Request, _env: Env): Promise<Response> {
    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
