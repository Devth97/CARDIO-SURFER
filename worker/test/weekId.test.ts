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
