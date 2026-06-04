import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFingerprint, isAirlineMatch, isHotelMatch } from '../src/matching.ts';
import type { AirlineTarget, HotelTarget, ProviderResult } from '../src/types.ts';

const hotelTarget: HotelTarget = {
  id: 'hotel-1',
  type: 'hotel',
  providerId: 'mock',
  name: 'Hilton Waikiki',
  hotelName: 'Hilton Waikiki',
  maxPoints: 50000,
  status: 'active',
  datePreference: { kind: 'exact', dates: ['2026-07-10'] },
  createdAt: '2026-06-03T00:00:00.000Z',
  updatedAt: '2026-06-03T00:00:00.000Z',
  alertedFingerprints: [],
};

const airlineTarget: AirlineTarget = {
  id: 'air-1',
  type: 'airline',
  providerId: 'mock',
  name: 'Tokyo Business',
  airline: 'United',
  route: { origin: 'SFO', destination: 'HND' },
  cabinClass: 'business',
  status: 'active',
  datePreference: { kind: 'range', startDate: '2026-11-01', endDate: '2026-11-05' },
  createdAt: '2026-06-03T00:00:00.000Z',
  updatedAt: '2026-06-03T00:00:00.000Z',
  alertedFingerprints: [],
};

test('matches hotel redemptions under max points', () => {
  const result: ProviderResult = {
    providerId: 'mock',
    kind: 'hotel',
    hotelName: 'Hilton Waikiki',
    date: '2026-07-10',
    points: 48000,
    available: true,
    title: 'Hilton Waikiki',
  };

  assert.equal(isHotelMatch(hotelTarget, result), true);
});

test('does not match airline redemptions outside route or class', () => {
  const result: ProviderResult = {
    providerId: 'mock',
    kind: 'airline',
    airline: 'United',
    route: { origin: 'SFO', destination: 'NRT' },
    cabinClass: 'business',
    date: '2026-11-02',
    points: 35000,
    available: true,
    title: 'United SFO-NRT Business',
  };

  assert.equal(isAirlineMatch(airlineTarget, result), false);
});

test('fingerprints are stable for the same result', () => {
  const result: ProviderResult = {
    providerId: 'mock',
    kind: 'hotel',
    hotelName: 'Hilton Waikiki',
    date: '2026-07-10',
    points: 48000,
    available: true,
    title: 'Hilton Waikiki',
  };

  assert.equal(buildFingerprint(hotelTarget, result), buildFingerprint(hotelTarget, result));
});
