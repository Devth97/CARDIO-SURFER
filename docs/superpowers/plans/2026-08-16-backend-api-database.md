# Backend API & Database (Phase 1, Plan 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the Cloudflare Workers API + D1 database described in the [Phase 1 TRD](../../technical/subway-fit-phase1-trd.md) — Firebase-token-verified endpoints for submitting runs and reading the weekly/all-time leaderboard and personal history. This plan produces a working, independently-testable backend; wiring the React frontend to it is a separate follow-up plan (`2026-08-16-frontend-auth-leaderboard.md`, written after this one ships).

**Architecture:** A new `worker/` directory at the repo root holds a self-contained Cloudflare Workers project (its own `package.json`, independent of the Vite frontend's dependencies). Business logic (week-ID computation, run-plausibility checks, Firebase token verification, D1 queries, route handlers) is split into small, directly-testable modules; `src/index.ts` is a thin HTTP router that wires them together with CORS handling. Tests run against a local D1 instance via `@cloudflare/vitest-pool-workers` — no live Cloudflare account needed until the final deploy task.

**Tech Stack:** Cloudflare Workers, Cloudflare D1 (SQLite), TypeScript, `jose` (JWT verification), Vitest + `@cloudflare/vitest-pool-workers` for testing, Wrangler CLI for local dev and deploy.

---

## File structure

```
worker/
  package.json
  wrangler.toml
  tsconfig.json
  vitest.config.ts
  migrations/
    0001_initial.sql
  src/
    types.ts          — Env interface, shared request/response types
    weekId.ts          — ISO-8601 week-ID computation
    plausibility.ts     — run sanity-bound checks
    auth.ts             — Firebase ID token verification
    db.ts               — D1 query helpers (upsertUser, insertRun, getLeaderboard, getUserHistory)
    routes.ts           — pure route-logic functions (one per endpoint), no HTTP concerns
    index.ts            — fetch handler: URL routing, auth header extraction, CORS, wires routes.ts to db.ts
  test/
    env.d.ts            — cloudflare:test ProvidedEnv augmentation
    apply-migrations.ts — test setup: applies migrations to the local test D1 instance
    weekId.test.ts
    plausibility.test.ts
    auth.test.ts
    db.test.ts
    routes.test.ts
    index.test.ts       — light HTTP-glue smoke tests (no auth required paths only)
```

---

### Task 1: Scaffold the Worker project

**Files:**
- Create: `worker/package.json`
- Create: `worker/wrangler.toml`
- Create: `worker/tsconfig.json`
- Create: `worker/src/types.ts`

- [ ] **Step 1: Create the directory and package.json**

```bash
mkdir -p worker/src worker/test worker/migrations
```

`worker/package.json`:

```json
{
  "name": "subway-fit-worker",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "db:migrate:local": "wrangler d1 migrations apply DB --local",
    "db:migrate:remote": "wrangler d1 migrations apply DB --remote"
  },
  "dependencies": {
    "jose": "^6.2.9"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.21.3",
    "@cloudflare/workers-types": "^5.20260816.1",
    "typescript": "~6.0.2",
    "vitest": "^4.1.10",
    "wrangler": "^4.123.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd worker && npm install
```

Expected: `node_modules/` created inside `worker/`, no errors. (This installs a second, independent `node_modules` — the worker project deliberately does not share the frontend's `package.json`, since its runtime and toolchain are unrelated.)

- [ ] **Step 3: Create `wrangler.toml`**

```toml
name = "subway-fit-api"
main = "src/index.ts"
compatibility_date = "2026-08-16"

[[d1_databases]]
binding = "DB"
database_name = "subway-fit-db"
database_id = "REPLACE_AFTER_WRANGLER_D1_CREATE"

[vars]
ALLOWED_ORIGIN = "http://localhost:5173"
FIREBASE_PROJECT_ID = "REPLACE_WITH_FIREBASE_PROJECT_ID"
```

`database_id` and `FIREBASE_PROJECT_ID` are placeholders on purpose — they're filled in with real values in Task 10 (Deploy), once a real Cloudflare D1 database and Firebase project exist. Local development and all automated tests in this plan use a local, file-based D1 instance and don't need these to be real yet.

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 5: Create `src/types.ts`**

```typescript
export interface Env {
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGIN: string;
}

export interface VerifiedUser {
  uid: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface RunSubmission {
  score: number;
  calories: number;
  durationSec: number;
}

export interface LeaderboardRow {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  score: number;
}

export interface HistoryRow {
  id: number;
  score: number;
  calories: number;
  durationSec: number;
  createdAt: string;
}
```

- [ ] **Step 6: Verify the project builds**

```bash
cd worker && npm run typecheck
```

Expected: passes with no errors (nothing references anything undefined yet — this just confirms the toolchain is wired up).

- [ ] **Step 7: Commit**

```bash
git add worker/package.json worker/package-lock.json worker/wrangler.toml worker/tsconfig.json worker/src/types.ts
git commit -m "worker: scaffold Cloudflare Workers project"
```

---

### Task 2: D1 schema migration

**Files:**
- Create: `worker/migrations/0001_initial.sql`

- [ ] **Step 1: Generate a correctly-named migration file via Wrangler**

```bash
cd worker && npx wrangler d1 migrations create DB initial
```

Expected: creates `worker/migrations/0001_initial.sql` (an empty template). Using the CLI to generate the filename avoids guessing at Wrangler's naming/numbering convention.

- [ ] **Step 2: Fill in the schema**

Replace the contents of `worker/migrations/0001_initial.sql` with:

```sql
CREATE TABLE users (
  uid          TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url   TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  uid           TEXT NOT NULL REFERENCES users(uid),
  score         INTEGER NOT NULL,
  calories      REAL NOT NULL,
  duration_sec  INTEGER NOT NULL,
  week_id       TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE INDEX idx_runs_week_score ON runs (week_id, score DESC);
CREATE INDEX idx_runs_score      ON runs (score DESC);
CREATE INDEX idx_runs_uid        ON runs (uid, created_at DESC);
```

- [ ] **Step 3: Apply it to a local D1 instance and verify**

```bash
cd worker && npx wrangler d1 migrations apply DB --local
npx wrangler d1 execute DB --local --command "SELECT name FROM sqlite_master WHERE type='table';"
```

Expected: output lists `users` and `runs` (plus SQLite's internal `sqlite_sequence`/`_cf_METADATA` tables). This creates a local SQLite file under `worker/.wrangler/` — safe to leave uncommitted.

- [ ] **Step 4: Ignore local Wrangler state and commit the migration**

Create `worker/.gitignore`:

```
.wrangler/
node_modules/
```

```bash
git add worker/.gitignore worker/migrations/0001_initial.sql
git commit -m "worker: add D1 schema migration for users and runs tables"
```

---

### Task 3: ISO week-ID helper

**Files:**
- Create: `worker/src/weekId.ts`
- Test: `worker/test/weekId.test.ts`

The weekly leaderboard resets by filtering on a `week_id` string like `"2026-W33"`, computed per ISO-8601 rules (weeks start Monday; a year's week 1 is the week containing that year's first Thursday). This has real edge cases at year boundaries, verified below against dates independently checked against a calendar.

- [ ] **Step 1: Write the failing tests**

`worker/test/weekId.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { isoWeekId } from '../src/weekId';

describe('isoWeekId', () => {
  it.each([
    ['2024-12-31', '2025-W01'], // Tuesday, but belongs to the week containing Jan 4 2025
    ['2025-01-01', '2025-W01'], // Wednesday
    ['2025-01-05', '2025-W01'], // Sunday, last day of week 1
    ['2025-01-06', '2025-W02'], // Monday, first day of week 2
    ['2026-08-16', '2026-W33'], // Sunday
    ['2026-08-17', '2026-W34'], // Monday, next ISO week starts
    ['2026-12-31', '2026-W53'], // Thursday, 2026 has a 53rd ISO week
    ['2027-01-01', '2026-W53'], // Friday, still in 2026's last week
    ['2027-01-04', '2027-W01'], // Monday, first day of 2027's week 1
  ])('maps %s to %s', (iso, expected) => {
    expect(isoWeekId(new Date(`${iso}T00:00:00Z`))).toBe(expected);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd worker && npx vitest run test/weekId.test.ts
```

Expected: FAIL — `Cannot find module '../src/weekId'` (file doesn't exist yet).

- [ ] **Step 3: Implement `weekId.ts`**

`worker/src/weekId.ts`:

```typescript
/**
 * Computes the ISO-8601 week identifier ("YYYY-Www") for a given date, in UTC.
 * ISO weeks start Monday; a year's week 1 is the week containing that year's
 * first Thursday, so the first/last few days of a calendar year can belong
 * to the adjacent year's week numbering.
 */
export function isoWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // shift to this week's Thursday

  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3);

  const weekNum = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd worker && npx vitest run test/weekId.test.ts
```

Expected: PASS, 9/9 cases.

- [ ] **Step 5: Commit**

```bash
git add worker/src/weekId.ts worker/test/weekId.test.ts
git commit -m "worker: add ISO week-id helper for weekly leaderboard reset"
```

---

### Task 4: Run-plausibility checks

**Files:**
- Create: `worker/src/plausibility.ts`
- Test: `worker/test/plausibility.test.ts`

Per TRD §5, these are generous sanity bounds, not gameplay simulation. Bounds are derived from the game's own constants (`src/game/constants.ts` and the calorie formula in `src/game/GameEngine.ts` in the frontend project): max distance rate is `MAX_SPEED (1.05) * METERS_PER_SPEED_UNIT_PER_SEC (12) = 12.6 m/s`; with the ×2 star-powerup multiplier and `SCORE_PER_METER = 1`, that's ~25.2 score/sec from distance alone, plus coin bonuses — so a ceiling of 40 score/sec (plus a flat allowance for short bursts) is generous, not tight. The calorie formula (`distanceM*0.065 + jumps*0.2 + ducks*0.32 + laneChanges*0.08`) tops out around 3.6 cal/sec even at the game's fastest-possible input rates, so 5 cal/sec is a generous ceiling.

- [ ] **Step 1: Write the failing tests**

`worker/test/plausibility.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { isPlausibleRun } from '../src/plausibility';

describe('isPlausibleRun', () => {
  it('accepts a realistic run', () => {
    expect(isPlausibleRun({ score: 850, calories: 42, durationSec: 90 })).toBe(true);
  });

  it('accepts a short but modest run', () => {
    expect(isPlausibleRun({ score: 50, calories: 3, durationSec: 5 })).toBe(true);
  });

  it('rejects a negative score', () => {
    expect(isPlausibleRun({ score: -10, calories: 5, durationSec: 30 })).toBe(false);
  });

  it('rejects a negative calorie count', () => {
    expect(isPlausibleRun({ score: 100, calories: -1, durationSec: 30 })).toBe(false);
  });

  it('rejects a score far beyond what the run duration allows', () => {
    expect(isPlausibleRun({ score: 1_000_000, calories: 50, durationSec: 30 })).toBe(false);
  });

  it('rejects a calorie count far beyond what the run duration allows', () => {
    expect(isPlausibleRun({ score: 500, calories: 10_000, durationSec: 30 })).toBe(false);
  });

  it('rejects a run shorter than the minimum plausible duration', () => {
    expect(isPlausibleRun({ score: 5, calories: 0, durationSec: 0.2 })).toBe(false);
  });

  it('rejects non-finite input', () => {
    expect(isPlausibleRun({ score: Infinity, calories: 5, durationSec: 30 })).toBe(false);
    expect(isPlausibleRun({ score: 5, calories: NaN, durationSec: 30 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd worker && npx vitest run test/plausibility.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `plausibility.ts`**

`worker/src/plausibility.ts`:

```typescript
import type { RunSubmission } from './types';

const MAX_SCORE_PER_SEC = 40;
const SCORE_BURST_ALLOWANCE = 100;
const MAX_CALORIES_PER_SEC = 5;
const MIN_DURATION_SEC = 1;

export function isPlausibleRun({ score, calories, durationSec }: RunSubmission): boolean {
  if (![score, calories, durationSec].every(Number.isFinite)) return false;
  if (score < 0 || calories < 0) return false;
  if (durationSec < MIN_DURATION_SEC) return false;
  if (score > durationSec * MAX_SCORE_PER_SEC + SCORE_BURST_ALLOWANCE) return false;
  if (calories > durationSec * MAX_CALORIES_PER_SEC) return false;
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd worker && npx vitest run test/plausibility.test.ts
```

Expected: PASS, 8/8 cases.

- [ ] **Step 5: Commit**

```bash
git add worker/src/plausibility.ts worker/test/plausibility.test.ts
git commit -m "worker: add run-plausibility sanity checks"
```

---

### Task 5: Firebase ID token verification

**Files:**
- Create: `worker/src/auth.ts`
- Test: `worker/test/auth.test.ts`

Cloudflare Workers can't use the Firebase Admin SDK (it needs Node.js APIs unavailable at the edge), so token verification is done directly: fetch Google's public JWKS for Firebase, verify the RS256 signature, and check `issuer`/`audience` match the Firebase project. The `jose` library handles the crypto; it's built for edge/Web Crypto runtimes like Workers.

- [ ] **Step 1: Write the failing tests**

`worker/test/auth.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyFirebaseToken } from '../src/auth';

const PROJECT_ID = 'test-project';
const KID = 'test-key';

async function buildTestJwks() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  return { privateKey, jwks: createLocalJWKSet({ keys: [publicJwk] }) };
}

describe('verifyFirebaseToken', () => {
  it('returns the verified user for a valid token', async () => {
    const { privateKey, jwks } = await buildTestJwks();
    const token = await new SignJWT({ name: 'Ada Lovelace', picture: 'https://example.com/a.png' })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setSubject('user-123')
      .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
      .setAudience(PROJECT_ID)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const result = await verifyFirebaseToken(token, PROJECT_ID, jwks);

    expect(result).toEqual({
      uid: 'user-123',
      displayName: 'Ada Lovelace',
      avatarUrl: 'https://example.com/a.png',
    });
  });

  it('falls back to null displayName/avatarUrl when absent from the token', async () => {
    const { privateKey, jwks } = await buildTestJwks();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setSubject('user-456')
      .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
      .setAudience(PROJECT_ID)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const result = await verifyFirebaseToken(token, PROJECT_ID, jwks);

    expect(result).toEqual({ uid: 'user-456', displayName: null, avatarUrl: null });
  });

  it('rejects a token signed for a different Firebase project', async () => {
    const { privateKey, jwks } = await buildTestJwks();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setSubject('user-123')
      .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
      .setAudience('some-other-project')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(verifyFirebaseToken(token, PROJECT_ID, jwks)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const { privateKey, jwks } = await buildTestJwks();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setSubject('user-123')
      .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
      .setAudience(PROJECT_ID)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);

    await expect(verifyFirebaseToken(token, PROJECT_ID, jwks)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd worker && npx vitest run test/auth.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `auth.ts`**

`worker/src/auth.ts`:

```typescript
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { VerifiedUser } from './types';

const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let remoteJwks: JWTVerifyGetKey | null = null;

export async function verifyFirebaseToken(
  token: string,
  projectId: string,
  jwks: JWTVerifyGetKey = (remoteJwks ??= createRemoteJWKSet(new URL(FIREBASE_JWKS_URL))),
): Promise<VerifiedUser> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Firebase token missing subject claim');
  }

  return {
    uid: payload.sub,
    displayName: typeof payload.name === 'string' ? payload.name : null,
    avatarUrl: typeof payload.picture === 'string' ? payload.picture : null,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd worker && npx vitest run test/auth.test.ts
```

Expected: PASS, 4/4 cases.

- [ ] **Step 5: Commit**

```bash
git add worker/src/auth.ts worker/test/auth.test.ts
git commit -m "worker: add Firebase ID token verification"
```

---

### Task 6: Test harness for D1 (migrations-in-test setup)

**Files:**
- Create: `worker/vitest.config.ts`
- Create: `worker/test/env.d.ts`
- Create: `worker/test/apply-migrations.ts`

Tasks 7 and 8 need a real (local) D1 binding with the schema already applied. This task wires that up once so every later test file can `import { env } from 'cloudflare:test'` and get a working `env.DB`.

- [ ] **Step 1: Create `vitest.config.ts`**

`worker/vitest.config.ts`:

```typescript
import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
  const migrationsPath = path.join(__dirname, 'migrations');
  const migrations = await readD1Migrations(migrationsPath);
  return {
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  };
});
```

- [ ] **Step 2: Create `test/env.d.ts`**

```typescript
import type { D1Migration } from '@cloudflare/vitest-pool-workers/config';
import type { Env } from '../src/types';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: readonly D1Migration[];
  }
}
```

- [ ] **Step 3: Create `test/apply-migrations.ts`**

```typescript
import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

- [ ] **Step 4: Verify the harness works by re-running the existing test suite**

```bash
cd worker && npx vitest run
```

Expected: all previously-passing tests (weekId, plausibility, auth) still pass, and no errors about `cloudflare:test` or migrations. If this step errors with something like "ProvidedEnv" or "applyD1Migrations is not exported," the installed `@cloudflare/vitest-pool-workers` version has a different testing API than expected here — check `worker/node_modules/@cloudflare/vitest-pool-workers/README.md` for the current documented pattern and adjust these three files accordingly. The business-logic tests in Tasks 3–5 don't depend on this working; only Tasks 7 and 8 do.

- [ ] **Step 5: Commit**

```bash
git add worker/vitest.config.ts worker/test/env.d.ts worker/test/apply-migrations.ts
git commit -m "worker: wire up local D1 test harness with migrations"
```

---

### Task 7: D1 query helpers

**Files:**
- Create: `worker/src/db.ts`
- Test: `worker/test/db.test.ts`

- [ ] **Step 1: Write the failing tests**

`worker/test/db.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd worker && npx vitest run test/db.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `db.ts`**

`worker/src/db.ts`:

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd worker && npx vitest run test/db.test.ts
```

Expected: PASS, 5/5 cases.

- [ ] **Step 5: Commit**

```bash
git add worker/src/db.ts worker/test/db.test.ts
git commit -m "worker: add D1 query helpers for users and runs"
```

---

### Task 8: Route logic

**Files:**
- Create: `worker/src/routes.ts`
- Test: `worker/test/routes.test.ts`

These are pure functions — already-verified `uid` in, D1 result out — so they're tested directly against `env.DB`, with no HTTP or auth involved (auth was already covered in Task 5; `index.ts` in Task 9 wires the two together).

- [ ] **Step 1: Write the failing tests**

`worker/test/routes.test.ts`:

```typescript
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { getLeaderboardRoute, getMyHistoryRoute, submitRunRoute, syncUserRoute } from '../src/routes';

beforeEach(async () => {
  await env.DB.exec('DELETE FROM runs');
  await env.DB.exec('DELETE FROM users');
});

describe('syncUserRoute', () => {
  it('upserts the caller\'s profile', async () => {
    await syncUserRoute(env, { uid: 'uid-1', displayName: 'Ada', avatarUrl: null });
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
    await syncUserRoute(env, { uid: 'uid-1', displayName: 'Ada', avatarUrl: null });

    const result = await submitRunRoute(env, 'uid-1', { score: 500, calories: 30, durationSec: 60 });

    expect(result).toEqual({ ok: true });
    const row = await env.DB.prepare('SELECT score FROM runs WHERE uid = ?1').bind('uid-1').first<{ score: number }>();
    expect(row?.score).toBe(500);
  });

  it('rejects an implausible run without inserting it', async () => {
    await syncUserRoute(env, { uid: 'uid-1', displayName: 'Ada', avatarUrl: null });

    const result = await submitRunRoute(env, 'uid-1', { score: 999999, calories: 30, durationSec: 5 });

    expect(result).toEqual({ ok: false, error: 'implausible run' });
    const row = await env.DB.prepare('SELECT COUNT(*) as count FROM runs WHERE uid = ?1')
      .bind('uid-1')
      .first<{ count: number }>();
    expect(row?.count).toBe(0);
  });
});

describe('getLeaderboardRoute', () => {
  it('returns entries for the requested scope', async () => {
    await syncUserRoute(env, { uid: 'uid-1', displayName: 'Ada', avatarUrl: null });
    await submitRunRoute(env, 'uid-1', { score: 500, calories: 30, durationSec: 60 });

    const result = await getLeaderboardRoute(env, 'alltime', 10);

    expect(result.scope).toBe('alltime');
    expect(result.entries).toEqual([{ uid: 'uid-1', displayName: 'Ada', avatarUrl: null, score: 500 }]);
  });
});

describe('getMyHistoryRoute', () => {
  it('returns only the caller\'s own runs', async () => {
    await syncUserRoute(env, { uid: 'uid-1', displayName: 'Ada', avatarUrl: null });
    await syncUserRoute(env, { uid: 'uid-2', displayName: 'Grace', avatarUrl: null });
    await submitRunRoute(env, 'uid-1', { score: 500, calories: 30, durationSec: 60 });
    await submitRunRoute(env, 'uid-2', { score: 900, calories: 40, durationSec: 90 });

    const result = await getMyHistoryRoute(env, 'uid-1', 10);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].score).toBe(500);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd worker && npx vitest run test/routes.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `routes.ts`**

`worker/src/routes.ts`:

```typescript
import { getLeaderboard, getUserHistory, insertRun, upsertUser } from './db';
import { isPlausibleRun } from './plausibility';
import type { Env, RunSubmission } from './types';
import { isoWeekId } from './weekId';

export async function syncUserRoute(
  env: Env,
  user: { uid: string; displayName: string | null; avatarUrl: string | null },
): Promise<{ ok: true }> {
  await upsertUser(env.DB, user.uid, user.displayName ?? 'Player', user.avatarUrl);
  return { ok: true };
}

export async function submitRunRoute(
  env: Env,
  uid: string,
  submission: RunSubmission,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPlausibleRun(submission)) {
    return { ok: false, error: 'implausible run' };
  }
  await insertRun(env.DB, {
    uid,
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd worker && npx vitest run test/routes.test.ts
```

Expected: PASS, 6/6 cases.

- [ ] **Step 5: Commit**

```bash
git add worker/src/routes.ts worker/test/routes.test.ts
git commit -m "worker: add route logic for sync/submit/leaderboard/history"
```

---

### Task 9: HTTP glue (`index.ts`)

**Files:**
- Create: `worker/src/index.ts`
- Test: `worker/test/index.test.ts`

This is the thin layer that turns HTTP requests into calls to `routes.ts`: URL/method matching, pulling the bearer token and verifying it, CORS headers, and JSON responses. Only the unauthenticated paths (CORS preflight, 404, and the public leaderboard) are covered by the automated test here — routes requiring a real Firebase-signed token are smoke-tested manually against `wrangler dev` in Task 10, since minting a real Google-signed token in a test would require a live Firebase project.

- [ ] **Step 1: Write the failing tests**

`worker/test/index.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd worker && npx vitest run test/index.test.ts
```

Expected: FAIL — module not found (`src/index.ts` doesn't exist yet, so `wrangler.toml`'s `main` points nowhere).

- [ ] **Step 3: Implement `index.ts`**

`worker/src/index.ts`:

```typescript
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
        const result = await submitRunRoute(env, user.uid, body);
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
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd worker && npx vitest run test/index.test.ts
```

Expected: PASS, 6/6 cases.

- [ ] **Step 5: Run the full test suite**

```bash
cd worker && npx vitest run && npm run typecheck
```

Expected: all test files pass; `typecheck` reports no errors.

- [ ] **Step 6: Commit**

```bash
git add worker/src/index.ts worker/test/index.test.ts
git commit -m "worker: add HTTP router with CORS and auth wiring"
```

---

### Task 10: Deploy to Cloudflare

This is the one task in this plan that needs a real Cloudflare account and a real Firebase project. Everything up to here has run entirely locally.

**Files:**
- Modify: `worker/wrangler.toml`

- [ ] **Step 1: Log in to Cloudflare**

```bash
cd worker && npx wrangler login
```

Expected: opens a browser to authorize Wrangler against your Cloudflare account (free tier is enough — see TRD §6 for why this can't generate a surprise bill under normal use).

- [ ] **Step 2: Create the production D1 database**

```bash
npx wrangler d1 create subway-fit-db
```

Expected: prints a `database_id`. Copy it.

- [ ] **Step 3: Update `wrangler.toml` with the real database ID**

In `worker/wrangler.toml`, replace `REPLACE_AFTER_WRANGLER_D1_CREATE` with the `database_id` value from Step 2.

- [ ] **Step 4: Apply the schema migration to production**

```bash
npx wrangler d1 migrations apply DB --remote
```

Expected: confirms `0001_initial.sql` applied.

- [ ] **Step 5: Create the Firebase project and get its project ID**

If not already done: go to the Firebase console, create a project, enable Authentication → Sign-in method → Google. Copy the **Project ID** (not the display name) from Project Settings.

- [ ] **Step 6: Update `wrangler.toml` with the real Firebase project ID and production frontend origin**

In `worker/wrangler.toml`, replace `REPLACE_WITH_FIREBASE_PROJECT_ID` with the real Firebase project ID. Leave `ALLOWED_ORIGIN` as `http://localhost:5173` for now — it gets updated to the real deployed frontend URL once that exists in the follow-up frontend plan.

- [ ] **Step 7: Deploy**

```bash
npx wrangler deploy
```

Expected: prints a live URL like `https://subway-fit-api.<your-subdomain>.workers.dev`. Save this URL — the frontend plan will need it.

- [ ] **Step 8: Smoke-test the live leaderboard endpoint**

```bash
curl "https://subway-fit-api.<your-subdomain>.workers.dev/leaderboard?scope=alltime"
```

Expected: `{"scope":"alltime","entries":[]}` (empty — no runs submitted yet).

- [ ] **Step 9: Enable Cloudflare usage notifications**

In the Cloudflare dashboard: Notifications → add a notification for Workers/D1 usage approaching free-tier limits. Per TRD §6 this doesn't prevent a bill (there isn't one by default) — it's early visibility if traffic grows faster than expected.

- [ ] **Step 10: Commit the real database ID and project ID**

```bash
git add worker/wrangler.toml
git commit -m "worker: deploy to Cloudflare, wire up production D1 database and Firebase project"
```

Note: `FIREBASE_PROJECT_ID` and the D1 `database_id` are not secrets (they identify the project/database, not credentials) so committing them in `wrangler.toml` is fine and is Cloudflare's standard practice.

---

## Plan self-review notes

- **Spec coverage:** all 4 endpoints from TRD §4 (Tasks 8–9), the schema from TRD §3 (Task 2), the auth flow from TRD §2 (Task 5), the plausibility baseline from TRD §5 (Task 4), and the cost safety net from TRD §6 (Task 10, Step 9) are each covered by a task.
- **Not covered here, by design:** the frontend never calls this API yet — that's the next plan (`2026-08-16-frontend-auth-leaderboard.md`), written and reviewed after this backend is deployed and confirmed working via the smoke test in Task 10.
- **Type consistency:** `RunSubmission`, `VerifiedUser`, `LeaderboardRow`, `HistoryRow`, and `Env` are defined once in `types.ts` (Task 1) and imported everywhere else — no redefinitions to drift out of sync.
