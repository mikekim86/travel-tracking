import { createHash } from 'node:crypto';
import { addDays, expandDatePreference } from './dates.ts';
import type {
  AirlineTarget,
  HotelTarget,
  MatchRecord,
  ProviderResult,
  Target,
} from './types.ts';

export function buildCandidateDates(target: Target): string[] {
  return expandDatePreference(target.datePreference);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function airlineRouteKey(origin: string, destination: string): string {
  return `${normalizeText(origin)}-${normalizeText(destination)}`;
}

export function buildFingerprint(target: Target, result: ProviderResult): string {
  const payload = {
    targetId: target.id,
    providerId: result.providerId,
    kind: result.kind,
    date: result.date,
    points: result.points,
    hotelName: result.kind === 'hotel' ? normalizeText(result.hotelName) : undefined,
    airline: result.kind === 'airline' ? normalizeText(result.airline) : undefined,
    route:
      result.kind === 'airline'
        ? airlineRouteKey(result.route.origin, result.route.destination)
        : undefined,
    cabinClass: result.kind === 'airline' ? normalizeText(result.cabinClass) : undefined,
  };

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function isHotelMatch(target: HotelTarget, result: ProviderResult): boolean {
  return (
    result.kind === 'hotel' &&
    normalizeText(result.hotelName) === normalizeText(target.hotelName) &&
    result.available &&
    result.points <= target.maxPoints &&
    buildCandidateDates(target).includes(result.date)
  );
}

export function isAirlineMatch(target: AirlineTarget, result: ProviderResult): boolean {
  return (
    result.kind === 'airline' &&
    normalizeText(result.airline) === normalizeText(target.airline) &&
    normalizeText(result.cabinClass) === normalizeText(target.cabinClass) &&
    airlineRouteKey(result.route.origin, result.route.destination) ===
      airlineRouteKey(target.route.origin, target.route.destination) &&
    result.available &&
    buildCandidateDates(target).includes(result.date)
  );
}

export function isMatch(target: Target, result: ProviderResult): boolean {
  if (target.providerId !== result.providerId) {
    return false;
  }

  if (target.type !== result.kind) {
    return false;
  }

  if (target.type === 'hotel') {
    return isHotelMatch(target, result);
  }

  return isAirlineMatch(target, result);
}

export function toMatchRecord(target: Target, result: ProviderResult): MatchRecord {
  return {
    targetId: target.id,
    providerId: result.providerId,
    fingerprint: buildFingerprint(target, result),
    title: result.title,
    date: result.date,
    points: result.points,
    details: result.details ?? '',
    createdAt: new Date().toISOString(),
  };
}

export function summarizeResult(target: Target, result: ProviderResult): string {
  if (target.type === 'hotel') {
    return [
      `${result.title}`,
      `date ${result.date}`,
      `${result.points.toLocaleString()} points`,
      `target max ${target.maxPoints.toLocaleString()} points`,
    ].join(' | ');
  }

  return [
    `${result.title}`,
    `${result.route.origin}-${result.route.destination}`,
    `${result.cabinClass}`,
    `date ${result.date}`,
    `${result.points.toLocaleString()} points`,
  ].join(' | ');
}

export function chooseMatchMessage(target: Target, match: MatchRecord): string {
  const headline =
    target.type === 'hotel'
      ? `Hotel redemption available: ${target.name}`
      : `Airline redemption available: ${target.name}`;
  return `${headline}\n${match.title}\nDate: ${match.date}\nPoints: ${match.points.toLocaleString()}\n${match.details}`.trim();
}

export function shiftDate(date: string, days: number): string {
  return addDays(date, days);
}
