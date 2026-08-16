import type { RunSubmission } from './types';

// These are generous sanity bounds, not gameplay simulation (TRD §5). Every
// constant below is derived from the frontend's real game constants/engine
// (`src/game/constants.ts` and `src/game/GameEngine.ts` at the repo root,
// read-only reference — not part of this worker) so a future maintainer can
// tell these are load-bearing derivations, not arbitrary round numbers.
//
// MAX_SCORE_PER_SEC — must cover BOTH scoring sources at max speed:
//   - Distance: MAX_SPEED (1.05) * METERS_PER_SPEED_UNIT_PER_SEC (12) = 12.6 m/s,
//     * SCORE_PER_METER (1) = ~12.6 score/sec.
//   - Coins: waves spawn every SPAWN_INTERVAL_MIN_MS (680ms) at max speed
//     => ~1.47 waves/sec. spawnCoinRun() fires on ~50% of waves with 3-5
//     coins (average 4, see GameEngine.spawnCoinRun) => ~2.94 coins/sec
//     expected value, * SCORE_PER_COIN (25) = ~73.5 score/sec.
//   Sustained combined (1x, no star multiplier) is therefore ~86/sec. The
//   ×2 star-powerup multiplier can roughly double the coin term while
//   active, but star uptime is short/bounded relative to a full run, so the
//   *sustained* per-second rate over a realistic run stays close to the 1x
//   figure. 110/sec leaves comfortable headroom above the ~86/sec estimate
//   for RNG variance (e.g. runs of unusually generous coin luck) without
//   reopening the door to forged high-score submissions.
const MAX_SCORE_PER_SEC = 110;

// Flat allowance so very short/early runs (before the per-second rate has
// "warmed up", plus rounding) aren't rejected at the boundary. Not derived
// from a game formula — just a small fixed buffer on top of the per-second
// ceiling above.
const SCORE_BURST_ALLOWANCE = 100;

// Calorie formula (GameEngine.ts): distanceM*0.065 + jumps*0.2 + ducks*0.32
// + laneChanges*0.08. At max speed (12.6 m/s) that's ~0.82 cal/sec from
// distance alone; even stacking the fastest possible input rates the game
// allows (JUMP_DURATION_MS=450ms, DUCK_MIN_HOLD_MS=180ms,
// LANE_CHANGE_MS=140ms) on top only brings the theoretical ceiling to
// ~3.6 cal/sec. 5 cal/sec is a generous ceiling above that.
const MAX_CALORIES_PER_SEC = 5;

// A run has to last at least this long to be a real play session rather
// than a rounding/replay artifact.
const MIN_DURATION_SEC = 1;

// Without an upper bound, a forged submission could claim an arbitrarily
// large durationSec to inflate the score/calorie ceilings (which scale
// linearly with duration) past any real value — e.g. `durationSec:
// 1_000_000` would let a score of 40,000,000 through. 3600 (1 hour) is a
// generous ceiling for a single endless-runner session; nothing legitimate
// plays one uninterrupted session longer than that.
const MAX_DURATION_SEC = 3600;

export function isPlausibleRun({ score, calories, durationSec }: RunSubmission): boolean {
  if (![score, calories, durationSec].every(Number.isFinite)) return false;
  if (score < 0 || calories < 0) return false;
  if (durationSec < MIN_DURATION_SEC) return false;
  if (durationSec > MAX_DURATION_SEC) return false;
  if (score > durationSec * MAX_SCORE_PER_SEC + SCORE_BURST_ALLOWANCE) return false;
  if (calories > durationSec * MAX_CALORIES_PER_SEC) return false;
  return true;
}
