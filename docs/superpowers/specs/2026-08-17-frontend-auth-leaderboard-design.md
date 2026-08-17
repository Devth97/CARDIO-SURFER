# Frontend Auth & Leaderboard Integration — Design

**Status:** Draft for review
**Date:** 2026-08-17
**Companion docs:** [Phase 1 PRD](../../product/subway-fit-phase1-prd.md), [Phase 1 TRD](../../technical/subway-fit-phase1-trd.md)
**Depends on:** the deployed backend from `2026-08-16-backend-api-database.md` (live at `https://subway-fit-api.subway-fit-worker.workers.dev`)

## 1. Background

The Phase 1 backend (Cloudflare Workers + D1 + Firebase Auth) is built, tested, and deployed. This design covers wiring the existing Vite/React/Three.js frontend to it: Google Sign-In, run submission, and the weekly/all-time leaderboard. It does not touch the game engine, pose tracking, or rendering — those are stable and out of scope.

## 2. Goals

1. Require Google Sign-In before a player can start a run, without blocking a casual visitor from viewing the public leaderboard.
2. Submit each completed run's score/calories/duration to the backend, and surface the resulting rank without a loading spinner breaking the game-over flow.
3. Let anyone (signed in or not) browse the weekly and all-time leaderboards.
4. Add an AdMob banner slot on non-gameplay screens, ready to activate once a real AdMob account exists.

## 3. Non-goals

- A dedicated "my run history" screen (the PRD only requires `GET /me/history`'s *data* to be reachable in principle — this plan wires the API client function but builds no UI for it; a follow-up plan can add the screen later).
- Any backend changes. This plan only consumes the four existing endpoints (`POST /users/sync`, `POST /runs`, `GET /leaderboard`, `GET /me/history`) as-is.
- A precise numeric rank for players outside the leaderboard's returned top N (see §6).
- Full AdMob SDK integration/monetization tuning — just the banner slot and placeholder, real ad unit IDs to follow once the AdMob account is created.

## 4. Screens & components

`Screen` type grows from `'start' | 'calibrating' | 'playing' | 'gameover'` to include `'signing-in' | 'leaderboard'`.

### `useAuth()` hook (new)
Wraps Firebase's `onAuthStateChanged`. Exposes `{ user: FirebaseUser | null, loading: boolean, signIn: () => Promise<void>, signOut: () => Promise<void> }`. `signIn` triggers the Google OAuth popup via Firebase Auth SDK. Consumed by `StartScreen`, `SignInScreen`, and the API client (for attaching the current ID token to requests).

### API client (`src/api/client.ts`, new)
Thin fetch wrapper around the four worker endpoints. Base URL from `VITE_API_URL` env var. Attaches `Authorization: Bearer <idToken>` when the caller has a signed-in user; omits it for the unauthenticated `GET /leaderboard`. Functions: `syncUser()`, `submitRun(submission)`, `getLeaderboard(scope, limit)`, `getMyHistory(limit)` (wired but unused by any screen yet, per §3).

### `StartScreen` (modified)
- Gains a `LEADERBOARD` button, always tappable regardless of auth state, routing to `leaderboard`.
- Once signed in, shows the player's Google avatar/display name in a corner. Tapping it offers "Sign out" (calls `useAuth().signOut()`).
- Tapping `PLAY` while signed out routes to `signing-in` instead of calling `setupCamera()` directly. While signed in, `PLAY` behaves exactly as it does today (calls `setupCamera()`, which requests camera permission and initializes the pose tracker, then routes to `calibrating`).
- Renders an `AdBanner`.

### `SignInScreen` (new)
Full-screen takeover (chosen over a modal — standard mobile pattern, easier to keep readable on small screens). "Sign in with Google" button calls `useAuth().signIn()`. On success: fires `POST /users/sync` (fire-and-forget — a failure here doesn't block play, see §7), then calls the same `setupCamera()` the existing signed-in `PLAY` path uses (camera permission + pose-tracker init) before routing to `calibrating` — the player already expressed intent to play by tapping PLAY before this screen appeared, so sign-in success resumes exactly where the pre-auth flow left off rather than skipping the camera-permission step. On failure (popup closed, network error): shows an inline error message with a retry affordance — this is the one place in the whole flow that surfaces an error to the player, since it's blocking and user-initiated.

### `LeaderboardScreen` (new)
Weekly/All-time tab toggle at the top (defaults to Weekly). Ranked list below: rank number, avatar, display name, score — the current player's row visually highlighted if they appear in the returned results. Fixed `AdBanner` at the bottom. Reachable from `StartScreen` and from `GameOverScreen`; a back action returns to whichever screen opened it. On fetch failure, shows a "Couldn't load leaderboard" message with a retry button (this screen's whole purpose is the list, so silent failure would just be a blank screen).

### `GameOverScreen` (modified)
Gains a third stat tile ("WEEKLY RANK") beside the existing Score/Calories tiles. Score and calories render immediately from the already-available local `GameSnapshot.stats` — completely unaffected by network timing. The moment this screen mounts, it fires `POST /runs` with `{ score, calories, durationSec }` in the background. The rank tile shows a placeholder (e.g. "—") until resolved:
- On success, calls `GET /leaderboard?scope=weekly` and looks for the player's own `uid` in the returned entries. If found, shows that rank. If not found (player ranked below the returned limit) or the submission/lookup fails for any reason, the tile just stays on its placeholder — no error shown (see §6, §7).
- Renders an `AdBanner`.

### `AdBanner` (new)
Small slot component rendered on `StartScreen`, `LeaderboardScreen`, `GameOverScreen` (all non-gameplay screens per PRD §5.5). Reads an ad unit ID from `VITE_ADMOB_BANNER_ID`. If unset (true until an AdMob account exists — see PRD/TRD manual-setup gap), renders an empty placeholder box of the correct size instead of a real ad, so nothing breaks or looks obviously wrong before that account is created.

## 5. Data flow

**Sign-in → play:** `StartScreen` (PLAY, signed out) → `SignInScreen` → Firebase Google OAuth popup → `useAuth()` updates → `POST /users/sync` (fire-and-forget) → `setupCamera()` (camera permission + pose-tracker init, same as the existing signed-in PLAY path) → `CalibrationScreen` → `GameEngine.start()`.

**Run submission:** `GameOverScreen` mounts → renders Score/Calories immediately from local state → `POST /runs` fires in background → on `{ok: true}`, `GET /leaderboard?scope=weekly` is called and searched for the player's `uid` to populate the rank tile; on `{ok: false}` or any error, the tile stays blank.

**Leaderboard viewing:** `LeaderboardScreen` calls `GET /leaderboard?scope=weekly|alltime` on mount and on tab switch. No auth header — works whether signed in or not.

**Sign-out:** `useAuth().signOut()` → Firebase clears the local session → `StartScreen` re-renders to its signed-out state.

## 6. Known limitation: rank lookup is top-N only

`GET /leaderboard` returns only the top N entries (default 50, capped 100 server-side — see the already-deployed backend). There is no dedicated "what's my exact rank" endpoint. This design deliberately reuses the existing endpoint rather than adding a new backend task: if a player's `uid` isn't present in the returned top-N results, the Game Over screen's WEEKLY RANK tile simply stays blank rather than showing a wrong or fabricated number.

This is an acceptable tradeoff for now — early in the leaderboard's life, most active players will be near the top of a still-small leaderboard. If it becomes a common complaint once the player base grows, a small follow-up backend task (e.g. a `GET /me/rank` endpoint using a `COUNT` query) can close the gap without any change to this frontend design's structure.

## 7. Error handling

| Failure | Behavior |
|---|---|
| Sign-in fails (popup closed, network) | Inline error + retry on `SignInScreen` — the only surfaced error in the whole flow |
| `POST /users/sync` fails | Silent; fire-and-forget, retried opportunistically on next natural trigger |
| `POST /runs` fails (network, 400 implausible, expired token) | Silent; Score/Calories still shown, WEEKLY RANK tile stays blank |
| Post-run rank lookup fails or player not in top N | Silent; WEEKLY RANK tile stays blank (same as above — indistinguishable to the player, which is fine) |
| `GET /leaderboard` fails on `LeaderboardScreen` | Visible "Couldn't load leaderboard" message + retry button (this screen's sole content) |
| Expired/invalid ID token on any authenticated call | Treated as an ordinary submission failure (silent) rather than forcing re-login mid-flow — Firebase's SDK auto-refreshes tokens well before expiry, so this should be rare |

## 8. Testing

- **API client:** unit tests with mocked `fetch` — auth-header attachment, each endpoint's request/response shape.
- **`useAuth()` hook:** tested against a mocked/emulated `onAuthStateChanged` — signed-in, signed-out, and loading states.
- **Component tests** (React Testing Library): `SignInScreen` error-and-retry path; `GameOverScreen` renders score/calories immediately regardless of network timing, rank tile updates or stays blank correctly; `LeaderboardScreen` tab switching and retry-on-failure.
- **Manual smoke test** against the real deployed worker before considering the plan done: sign in with a real Google account → play a run → confirm it appears on both leaderboards → confirm sign-out works → confirm a signed-out visitor can still view the leaderboard.

## 9. Manual setup still required (carried from PRD/TRD, not resolved by this plan)

- **Firebase Web App registration** in the `cardio-surfer` Firebase project (Project Settings → add a Web app) to obtain the `VITE_FIREBASE_*` config values this plan's code needs. Blocking — the sign-in flow can't be tested against anything real without it.
- **AdMob account + app registration**, to obtain a real `VITE_ADMOB_BANNER_ID`. Not blocking for this plan (placeholder banners render fine without it) but needed before ads actually show real content.
- **Cloudflare Pages project** for hosting the built frontend, and updating the deployed worker's `ALLOWED_ORIGIN` once that URL exists — tracked as a deploy-time follow-up, likely the final task of the implementation plan this design feeds into.
