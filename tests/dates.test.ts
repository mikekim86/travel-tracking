import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, expandDatePreference, toIsoDate } from '../src/dates.ts';

test('expands exact dates and deduplicates', () => {
  const dates = expandDatePreference({
    kind: 'exact',
    dates: ['2026-11-02', '2026-11-01', '2026-11-02'],
  });
  assert.deepEqual(dates, ['2026-11-01', '2026-11-02']);
});

test('expands month to all dates in the month', () => {
  const dates = expandDatePreference({
    kind: 'month',
    year: 2026,
    month: 2,
  });
  assert.equal(dates[0], '2026-02-01');
  assert.equal(dates.at(-1), '2026-02-28');
  assert.equal(dates.length, 28);
});

test('expands inclusive date ranges', () => {
  const dates = expandDatePreference({
    kind: 'range',
    startDate: '2026-06-01',
    endDate: '2026-06-03',
  });
  assert.deepEqual(dates, ['2026-06-01', '2026-06-02', '2026-06-03']);
});

test('date helpers', () => {
  assert.equal(toIsoDate('2026-06-03'), '2026-06-03');
  assert.equal(addDays('2026-06-03', 2), '2026-06-05');
});
