import { addDays } from './dates.ts';
import type { HotelProviderResult, ProviderQuery } from './types.ts';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function normalizePoints(value: string): number | undefined {
  const cleaned = value.replace(/,/g, '').trim();
  if (!/^\d+$/.test(cleaned)) {
    return undefined;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('\\"', '"');
}

function extractScripts(html: string): string[] {
  const scripts: string[] = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    if (match[1].trim()) {
      scripts.push(match[1]);
    }
  }
  return scripts;
}

function collectCandidatePoints(html: string): number[] {
  const points = new Set<number>();
  const text = decodeHtmlEntities(html);

  for (const script of extractScripts(text)) {
    const matches = script.matchAll(
      /(pointsPerNight|awardPoints|rewardPoints|["']?points["']?)\D{0,40}(\d[\d,]*)/gi,
    );
    for (const match of matches) {
      const parsed = normalizePoints(match[2]);
      if (parsed) {
        points.add(parsed);
      }
    }
  }

  const genericMatches = text.matchAll(/(\d[\d,]{2,})\s*points?\b/gi);
  for (const match of genericMatches) {
    const parsed = normalizePoints(match[1]);
    if (parsed) {
      points.add(parsed);
    }
  }

  return [...points].sort((a, b) => a - b);
}

function collectPointsFromText(text: string): number[] {
  const points = new Set<number>();

  for (const match of text.matchAll(/(\d[\d,]{2,})\s*points?\b/gi)) {
    const parsed = normalizePoints(match[1]);
    if (parsed) {
      points.add(parsed);
    }
  }

  return [...points].sort((a, b) => a - b);
}

function isFlexibleDatesUrl(baseUrl: string): boolean {
  return baseUrl.includes('/flexibledates/');
}

function isoDateForMonthDay(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseFlexibleCalendar(html: string, year: number, month: number, hotelName: string): HotelProviderResult[] {
  const text = decodeHtmlEntities(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const results: HotelProviderResult[] = [];
  const seen = new Set<string>();
  const cellRegex = /(\d{1,2})\s*-\s*(\d{1,2})/g;
  let match: RegExpExecArray | null;

  while ((match = cellRegex.exec(text))) {
    const startDay = Number(match[1]);
    const snippet = text.slice(match.index, Math.min(text.length, match.index + 1200));
    if (/5 night stay unavailable/i.test(snippet) || /unavailable/i.test(snippet)) {
      continue;
    }

    const points = collectPointsFromText(snippet);
    for (const pointValue of points) {
      const fingerprint = `${startDay}:${pointValue}`;
      if (seen.has(fingerprint)) {
        continue;
      }
      seen.add(fingerprint);
      results.push({
        providerId: 'hilton-public',
        kind: 'hotel',
        hotelName,
        date: isoDateForMonthDay(year, month, startDay),
        points: pointValue,
        available: true,
        title: 'Hilton flexible-date award rate',
        details: `Flexible calendar availability for ${isoDateForMonthDay(year, month, startDay)}`,
        raw: {
          snippet,
        },
      });
    }
  }

  const renderedCellRegex =
    /(\d{1,2})\s*-\s*(\d{1,2})([\s\S]{0,700}?)(\d[\d,]*)\s*Points?\s*per\s*night\s*for\s*5\s*nights?/gi;
  while ((match = renderedCellRegex.exec(text))) {
    const startDay = Number(match[1]);
    const snippet = match[0];
    if (/unavailable/i.test(snippet)) {
      continue;
    }
    const pointValue = normalizePoints(match[4]);
    if (!pointValue) {
      continue;
    }
    const fingerprint = `${startDay}:${pointValue}`;
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    results.push({
      providerId: 'hilton-public',
      kind: 'hotel',
      hotelName,
      date: isoDateForMonthDay(year, month, startDay),
      points: pointValue,
      available: true,
      title: 'Hilton flexible-date award rate',
      details: `Flexible calendar availability for ${isoDateForMonthDay(year, month, startDay)}`,
      raw: {
        snippet,
      },
    });
  }

  return results;
}

function monthQueryList(targetMonths: { year: number; month: number }[] | { year: number; month: number }): { year: number; month: number }[] {
  return Array.isArray(targetMonths) ? targetMonths : [targetMonths];
}

function withDates(baseUrl: string, arrivalDate: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('arrivalDate', arrivalDate);
  url.searchParams.set('departureDate', addDays(arrivalDate, 1));
  url.searchParams.set('redeemPts', 'true');
  if (!url.searchParams.get('room1NumAdults')) {
    url.searchParams.set('room1NumAdults', '1');
  }
  return url.toString();
}

export function buildHiltonSearchUrl(baseUrl: string, arrivalDate: string): string {
  return withDates(baseUrl, arrivalDate);
}

export async function searchHiltonPublic(query: ProviderQuery): Promise<HotelProviderResult[]> {
  if (query.target.type !== 'hotel') {
    return [];
  }

  const baseUrl = query.target.publicSearchUrl;
  if (!baseUrl) {
    return [];
  }

  if (isFlexibleDatesUrl(baseUrl) && (query.target.datePreference.kind === 'month' || query.target.datePreference.kind === 'months')) {
    const monthSpecs =
      query.target.datePreference.kind === 'month'
        ? [{ year: query.target.datePreference.year, month: query.target.datePreference.month }]
        : monthQueryList(query.target.datePreference.months);
    const results: HotelProviderResult[] = [];

    for (const monthSpec of monthSpecs) {
      const monthUrl = new URL(baseUrl);
      const arrivalDate = isoDateForMonthDay(monthSpec.year, monthSpec.month, 1);
      monthUrl.searchParams.set('arrivalDate', arrivalDate);
      monthUrl.searchParams.set('departureDate', addDays(arrivalDate, 5));
      monthUrl.searchParams.set('redeemPts', 'true');
      if (!monthUrl.searchParams.get('room1NumAdults')) {
        monthUrl.searchParams.set('room1NumAdults', '1');
      }

      const response = await fetch(monthUrl.toString(), {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      results.push(...parseFlexibleCalendar(html, monthSpec.year, monthSpec.month, query.target.hotelName));
    }

    return results.map((result) => ({
      ...result,
      providerId: query.target.providerId,
    }));
  }

  const results: HotelProviderResult[] = [];
  for (const date of query.candidateDates) {
    const url = buildHiltonSearchUrl(baseUrl, date);
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      continue;
    }

    const html = await response.text();
    const points = collectCandidatePoints(html);
    for (const pointValue of points) {
      results.push({
        providerId: query.target.providerId,
        kind: 'hotel',
        hotelName: query.target.hotelName,
        date,
        points: pointValue,
        available: true,
        title: `${query.target.hotelName} award rate`,
        details: `Public Hilton search for ${date}`,
        raw: {
          searchUrl: url,
        },
      });
    }

    if (points.length === 0 && /sold out|no rooms available|unavailable/i.test(html)) {
      results.push({
        providerId: query.target.providerId,
        kind: 'hotel',
        hotelName: query.target.hotelName,
        date,
        points: Number.POSITIVE_INFINITY,
        available: false,
        title: `${query.target.hotelName} sold out`,
        details: `Public Hilton search for ${date} showed no award rooms`,
        raw: {
          searchUrl: url,
        },
      });
    }
  }

  return results;
}
