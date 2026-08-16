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
