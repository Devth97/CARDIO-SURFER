# Subway Fit — Phase 1 Backend TRD

**Status:** Draft for review
**Date:** 2026-08-16
**Companion doc:** [Phase 1 PRD](../product/subway-fit-phase1-prd.md)

## 1. Architecture overview

```
React app (existing, unchanged)
   │  Firebase ID token on every API call
   ▼
Cloudflare Workers API  ──────►  Cloudflare D1 (SQLite)
   ▲
   │ verifies token
Firebase Authentication (Google Sign-In only)
```

- **Frontend:** existing Vite/React/Three.js app. Adds a Firebase Auth SDK call for Google Sign-In and a thin API client for the endpoints in §4.
- **API:** Cloudflare Workers — serverless functions, no server to manage or patch.
- **Database:** Cloudflare D1, a managed SQLite database built for Workers.
- **Auth:** Firebase Authentication, Google provider only. The frontend signs in directly with Firebase; the Worker never sees a password, only a short-lived ID token to verify.

**Why this split:** Cloudflare's free tier is generous and does not silently escalate to a paid plan on overage (see §6) — the main requirement given the "no surprise bill" constraint. Firebase Auth's free tier covers unlimited Google Sign-In. No servers, containers, or VMs to patch or pay for idle time on.

## 2. Auth flow

1. Player taps "Sign in with Google" → Firebase Auth SDK (client-side) handles the OAuth flow and returns a signed-in Firebase user.
2. Frontend requests a Firebase **ID token** (short-lived JWT, auto-refreshed by the SDK) and attaches it as `Authorization: Bearer <token>` on every request to the Workers API.
3. Every Worker endpoint that mutates data (`POST /runs`) verifies the token's signature and expiry against Firebase's public keys before trusting `uid` from it. Read-only endpoints (`GET /leaderboard`) don't require a token.
4. The Worker never issues its own session tokens or stores passwords — Firebase is the sole identity source of truth. The player's Firebase `uid` is the primary key used everywhere downstream.

## 3. Data model (Cloudflare D1 / SQLite)

```sql
CREATE TABLE users (
  uid          TEXT PRIMARY KEY,       -- Firebase UID
  display_name TEXT NOT NULL,
  avatar_url   TEXT,
  created_at   TEXT NOT NULL           -- ISO 8601
);

CREATE TABLE runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  uid           TEXT NOT NULL REFERENCES users(uid),
  score         INTEGER NOT NULL,
  calories      REAL NOT NULL,
  duration_sec  INTEGER NOT NULL,
  week_id       TEXT NOT NULL,         -- e.g. "2026-W33", derived from created_at (ISO week)
  created_at    TEXT NOT NULL          -- ISO 8601
);

CREATE INDEX idx_runs_week_score ON runs (week_id, score DESC);
CREATE INDEX idx_runs_score      ON runs (score DESC);
CREATE INDEX idx_runs_uid        ON runs (uid, created_at DESC);
```

- A single `runs` table backs both leaderboards: the **all-time** leaderboard ignores `week_id`; the **weekly** leaderboard filters `WHERE week_id = <current week>`. No separate weekly-snapshot table or reset job is needed — "reset" is just the `week_id` changing.
- Each leaderboard row shown to the user is a player's **best single score** in scope (`MAX(score) GROUP BY uid`), not a sum — this matches how Subway-Surfers-style leaderboards conventionally work and avoids rewarding grinding low scores over one great run. This resolves the PRD's open question in favor of "best score."
- `users` row is created/updated (display name, avatar) on first sign-in and whenever those change, via an idempotent upsert triggered from the frontend after Firebase Auth succeeds.

## 4. API endpoints (Cloudflare Workers)

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /users/sync` | required | Upsert the caller's `users` row from their current Firebase profile (display name, avatar). Called once per session after sign-in. |
| `POST /runs` | required | Submit a completed run: `{ score, calories, duration_sec }`. Server computes `week_id` and `created_at` from server time (never trusts client-supplied timestamps). Runs the plausibility check in §5 before inserting. |
| `GET /leaderboard?scope=weekly\|alltime&limit=50` | none | Returns top N rows: `{ uid, display_name, avatar_url, score }`, best-score-per-player, ordered descending. |
| `GET /me/history?limit=50` | required | Returns the caller's own past runs, most recent first. |

All responses are JSON. All mutating endpoints validate the Firebase ID token server-side per §2 before touching D1.

## 5. Anti-abuse baseline (Phase 1 scope only)

`POST /runs` rejects (HTTP 400, silently dropped from leaderboard consideration) any submission where:
- `score` exceeds what's achievable given `duration_sec` and the game's known obstacle-spawn rate (a generous upper bound, not a tight one — this is a sanity check, not gameplay simulation).
- `calories` exceeds a generous per-minute maximum for the reported `duration_sec`.
- `duration_sec` is below a minimum plausible run length.

This is intentionally lightweight — it stops trivially-fabricated numbers from wrecking the free leaderboard, but it is **not** server-authoritative replay verification. Because gameplay and scoring run entirely client-side today, a determined user can still fake a score within these bounds via DevTools. That gap is acceptable for a free leaderboard and is explicitly called out as a must-fix before any real-money feature (Phase 2), where a fabricated score has a direct financial payout.

## 6. Cost & scaling safety net

- **Cloudflare Workers free tier:** 100,000 requests/day. Overage behavior is to throttle/error, not to auto-bill — there is no way to accidentally incur charges without manually enabling a paid plan.
- **Cloudflare D1 free tier:** 5 GB storage, 5 million rows read/day, 100k rows written/day — orders of magnitude above expected early traffic (each run = 1 write; each leaderboard view = 1 read).
- **Firebase Authentication:** free, unlimited, for Google Sign-In.
- **Action item before launch:** enable Cloudflare's usage notifications so the developer gets an email if free-tier thresholds are approached, even though there's no billing risk by default — this is a visibility measure, not a cost-control one.

## 7. Testing approach

- Unit-test the plausibility-check logic (§5) with known-good and known-bad score/calorie/duration combinations.
- Integration-test each endpoint against a local D1 instance (Wrangler supports local D1 emulation) before deploying: sign-in → submit run → appears on weekly leaderboard → appears on all-time leaderboard → correct row on `/me/history`.
- Manually verify the weekly reset boundary by inserting a run with a `week_id` from the prior week and confirming it drops off the weekly view but stays on all-time.

## 8. Rollout

1. Provision Firebase project (Google Sign-In provider enabled) and Cloudflare Workers + D1 database.
2. Implement and deploy the four endpoints above against D1.
3. Wire the frontend: sign-in gate before first run, `POST /users/sync` after auth, `POST /runs` at game-over, leaderboard screen backed by `GET /leaderboard`.
4. Add the AdMob banner per PRD §5.5 (client-side only, no backend dependency).
5. Smoke-test end-to-end on a real device before wider release.
