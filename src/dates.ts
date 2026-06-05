import type { DatePreference } from './types.ts';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function toIsoDate(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${String(input)}`);
  }
  return date.toISOString().slice(0, 10);
}

export function parseDateParts(value: string): { year: number; month: number; day: number } {
  const parts = value.split('-').map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    throw new Error(`Invalid date format: ${value}`);
  }
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return { year, month, day };
}

export function isSameDate(a: string, b: string): boolean {
  return a === b;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: string, amount: number): string {
  const parsed = parseDateParts(date);
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

export function expandDatePreference(preference: DatePreference): string[] {
  if (preference.kind === 'exact') {
    return [...new Set(preference.dates.map(toIsoDate))].sort();
  }

  if (preference.kind === 'months') {
    const dates: string[] = [];
    const seen = new Set<string>();
    for (const monthSpec of preference.months) {
      const totalDays = daysInMonth(monthSpec.year, monthSpec.month);
      for (let day = 1; day <= totalDays; day += 1) {
        const date = `${monthSpec.year}-${pad(monthSpec.month)}-${pad(day)}`;
        if (!seen.has(date)) {
          seen.add(date);
          dates.push(date);
        }
      }
    }
    return dates.sort();
  }

  if (preference.kind === 'range') {
    const start = toIsoDate(preference.startDate);
    const end = toIsoDate(preference.endDate);
    if (start > end) {
      throw new Error('Range startDate must be on or before endDate');
    }
    const dates: string[] = [];
    let current = start;
    while (current <= end) {
      dates.push(current);
      current = addDays(current, 1);
    }
    return dates;
  }

  const totalDays = daysInMonth(preference.year, preference.month);
  const dates: string[] = [];
  for (let day = 1; day <= totalDays; day += 1) {
    dates.push(`${preference.year}-${pad(preference.month)}-${pad(day)}`);
  }
  return dates;
}
