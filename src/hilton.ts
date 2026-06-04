import { addDays } from './dates.ts';
import type { HotelProviderResult, ProviderQuery } from './types.ts';

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
