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
