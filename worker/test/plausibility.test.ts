import { describe, expect, it } from 'vitest';
import { isPlausibleRun } from '../src/plausibility';

describe('isPlausibleRun', () => {
  it('accepts a realistic run', () => {
    expect(isPlausibleRun({ score: 850, calories: 42, durationSec: 90 })).toBe(true);
  });

  it('accepts a short but modest run', () => {
    expect(isPlausibleRun({ score: 50, calories: 3, durationSec: 5 })).toBe(true);
  });

  it('accepts a coin-heavy realistic run (regression guard for the coin-income gap)', () => {
    // A skilled 60-second run sustaining close to max speed: distance score
    // ~12.6/sec plus coin income from a normal (not exceptional) share of
    // spawned coin runs — roughly the ~86/sec combined rate derived in
    // plausibility.ts from src/game/constants.ts + GameEngine.ts. This is
    // well above the old (flawed) 40/sec ceiling, which would have wrongly
    // rejected it — that's exactly the bug this test guards against.
    expect(isPlausibleRun({ score: 4800, calories: 45, durationSec: 60 })).toBe(true);
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

  it('rejects a run longer than the maximum plausible duration', () => {
    expect(isPlausibleRun({ score: 100, calories: 5, durationSec: 3601 })).toBe(false);
  });

  it('rejects a forged submission that claims a huge durationSec to bypass the score/calorie ceilings', () => {
    // Without an upper bound on durationSec, score/calorie ceilings (which
    // scale linearly with duration) can be defeated by simply claiming an
    // enormous session length. This is the exact forged example from the
    // code review that originally slipped through.
    expect(isPlausibleRun({ score: 40_000_000, calories: 1, durationSec: 1_000_000 })).toBe(false);
  });

  it('accepts a plausible run right at the maximum duration boundary', () => {
    expect(isPlausibleRun({ score: 100, calories: 5, durationSec: 3600 })).toBe(true);
  });

  it('rejects non-finite input', () => {
    expect(isPlausibleRun({ score: Infinity, calories: 5, durationSec: 30 })).toBe(false);
    expect(isPlausibleRun({ score: 5, calories: NaN, durationSec: 30 })).toBe(false);
  });
});
