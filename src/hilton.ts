import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { addDays } from './dates.ts';
import { log } from './logger.ts';
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

function formatMonthShort(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatMonthLong(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

const safariDriverPaths = ['/System/Cryptexes/App/usr/bin/safaridriver', 'safaridriver'];
const safariDriverPort = 9515;

async function requestJson(url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const text = await response.text();
  if (!text) {
    return { status: response.status, body: undefined };
  }
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text };
  }
}

async function waitForSafariDriver(port: number, timeoutMs = 10_000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/status`);
      if (response.ok) {
        return true;
      }
    } catch {
      // Keep polling until the driver is ready.
    }
    await delay(250);
  }
  return false;
}

async function renderHiltonPageText(
  url: string,
  targetMonth?: { year: number; month: number },
): Promise<string | undefined> {
  if (process.execArgv.includes('--test')) {
    return undefined;
  }

  log('hilton', 'render start', { url, targetMonth });
  for (const executable of safariDriverPaths) {
    const driver = spawn(executable, ['--port', String(safariDriverPort)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    log('hilton', 'safari driver spawn', { executable, port: safariDriverPort, pid: driver.pid });
    let stderr = '';
    driver.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    try {
      const ready = await waitForSafariDriver(safariDriverPort);
      if (!ready) {
        throw new Error(`Safari driver did not start: ${stderr.trim()}`);
      }

      const sessionResponse = await requestJson(`http://127.0.0.1:${safariDriverPort}/session`, {
        method: 'POST',
        body: JSON.stringify({
          capabilities: {
            alwaysMatch: {
              browserName: 'safari',
            },
          },
        }),
      });
      const sessionPayload = sessionResponse.body as unknown;
      const sessionObject =
        sessionPayload && typeof sessionPayload === 'object' ? (sessionPayload as Record<string, unknown>) : undefined;
      const sessionValue =
        sessionObject && sessionObject.value && typeof sessionObject.value === 'object'
          ? (sessionObject.value as Record<string, unknown>)
          : undefined;
      const sessionId =
        typeof sessionValue?.sessionId === 'string'
          ? sessionValue.sessionId
          : typeof sessionObject?.sessionId === 'string'
            ? (sessionObject.sessionId as string)
            : undefined;
      if (!sessionId) {
        throw new Error(
          `Safari session creation failed: ${
            (typeof sessionValue?.message === 'string' && sessionValue.message) ||
            (typeof sessionValue?.error === 'string' && sessionValue.error) ||
            (typeof sessionObject?.message === 'string' && sessionObject.message) ||
            (typeof sessionObject?.error === 'string' && sessionObject.error) ||
            stderr.trim() ||
            'remote automation may be disabled'
          }`,
        );
      }
      log('hilton', 'safari session created', { sessionId });

      try {
        await requestJson(`http://127.0.0.1:${safariDriverPort}/session/${sessionId}/url`, {
          method: 'POST',
          body: JSON.stringify({ url }),
        });
        log('hilton', 'navigated to url', { sessionId, url });

        if (targetMonth) {
          const targetYear = targetMonth.year;
          const targetMonthNumber = targetMonth.month;
          const shortLabel = formatMonthShort(targetYear, targetMonthNumber);
          const longLabel = formatMonthLong(targetYear, targetMonthNumber);
          log('hilton', 'select month requested', {
            sessionId,
            targetYear,
            targetMonthNumber,
            shortLabel,
            longLabel,
          });

          for (let attempt = 0; attempt < 15; attempt += 1) {
            const buttonsResponse = await requestJson(
              `http://127.0.0.1:${safariDriverPort}/session/${sessionId}/execute/sync`,
              {
                method: 'POST',
                body: JSON.stringify({
                  script:
                    'return [...document.querySelectorAll("button")].map((button, index) => ({ index, text: (button.innerText || "").trim(), aria: button.getAttribute("aria-label") || "", cls: button.className || "" }));',
                  args: [],
                }),
              },
            );
            const buttonList = (buttonsResponse.body as
              | { value?: Array<{ index: number; text: string; aria: string; cls: string }> }
              | Array<{ index: number; text: string; aria: string; cls: string }>
              | undefined) as Array<{ index: number; text: string; aria: string; cls: string }> | undefined;
            const buttons = Array.isArray(buttonList)
              ? buttonList
              : (buttonsResponse.body as { value?: Array<{ index: number; text: string; aria: string; cls: string }> } | undefined)
                  ?.value;

            const match = (buttons ?? []).find(
              (button) =>
                button.text === shortLabel ||
                button.text === longLabel ||
                button.text.includes(shortLabel) ||
                button.text.includes(longLabel) ||
                button.aria.includes(shortLabel) ||
                button.aria.includes(longLabel),
            );

            log('hilton', 'month button scan', {
              sessionId,
              attempt,
              buttonCount: buttons?.length ?? 0,
              found: Boolean(match),
            });

            if (match) {
              if (!/border-primary|selected|active/i.test(match.cls)) {
                await requestJson(
                  `http://127.0.0.1:${safariDriverPort}/session/${sessionId}/execute/sync`,
                  {
                    method: 'POST',
                    body: JSON.stringify({
                      script: `const buttons = [...document.querySelectorAll("button")]; const button = buttons[${match.index}]; if (button) { button.click(); return true; } return false;`,
                      args: [],
                    }),
                  },
                );
              }

              for (let waitAttempt = 0; waitAttempt < 20; waitAttempt += 1) {
                const bodyResponse = await requestJson(
                  `http://127.0.0.1:${safariDriverPort}/session/${sessionId}/execute/sync`,
                  {
                    method: 'POST',
                    body: JSON.stringify({
                      script: 'return document.body ? document.body.innerText : "";',
                      args: [],
                    }),
                  },
                );
                const bodyText = String(
                  ((bodyResponse.body as { value?: string } | undefined)?.value ?? bodyResponse.body ?? ''),
                );
                log('hilton', 'month wait snapshot', {
                  sessionId,
                  waitAttempt,
                  bodyPreview: bodyText.slice(0, 200),
                });
                if (bodyText.includes(longLabel) || bodyText.includes(shortLabel)) {
                  break;
                }
                await delay(250);
              }
              break;
            }

            await delay(250);
          }
        }

        for (let attempt = 0; attempt < 20; attempt += 1) {
          const readyStateResponse = await requestJson(
            `http://127.0.0.1:${safariDriverPort}/session/${sessionId}/execute/sync`,
            {
              method: 'POST',
              body: JSON.stringify({
                script: 'return document.readyState;',
                args: [],
              }),
            },
          );
          const readyStatePayload = readyStateResponse.body as { value?: string } | undefined;
          if (readyStatePayload?.value === 'complete' || readyStatePayload?.value === 'interactive') {
            break;
          }
          await delay(500);
        }

        const renderedResponse = await requestJson(
          `http://127.0.0.1:${safariDriverPort}/session/${sessionId}/execute/sync`,
          {
            method: 'POST',
            body: JSON.stringify({
              script: 'return document.body ? document.body.innerText : "";',
              args: [],
            }),
          },
        );
        const renderedPayload = renderedResponse.body as { value?: string } | undefined;
        if (typeof renderedPayload?.value === 'string' && renderedPayload.value.trim()) {
          log('hilton', 'rendered text captured', {
            sessionId,
            length: renderedPayload.value.length,
            preview: renderedPayload.value.slice(0, 400),
          });
          return renderedPayload.value;
        }
        log('hilton', 'rendered text missing', { sessionId });
      } finally {
        await requestJson(`http://127.0.0.1:${safariDriverPort}/session/${sessionId}`, {
          method: 'DELETE',
        }).catch(() => undefined);
      }
    } catch (error) {
      const message = (error as Error).message;
      log('hilton', 'render error', { message, stderr: stderr.slice(0, 500) });
      if (
        /Allow remote automation/i.test(message) ||
        /Could not create a session/i.test(message) ||
        /remote automation/i.test(stderr)
      ) {
        driver.kill('SIGTERM');
        return undefined;
      }
    } finally {
      driver.kill('SIGTERM');
    }
  }

  return undefined;
}

function parseFlexibleCalendar(html: string, year: number, month: number, hotelName: string): HotelProviderResult[] {
  const text = decodeHtmlEntities(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const results: HotelProviderResult[] = [];
  const seen = new Set<string>();
  const cellRegex = /(\d{1,2})\s*-\s*(\d{1,2})/g;
  let match: RegExpExecArray | null;
  log('hilton', 'parse flexible calendar', {
    year,
    month,
    hotelName,
    preview: text.slice(0, 600),
  });

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
      log('hilton', 'flex calendar result', {
        year,
        month,
        day: startDay,
        points: pointValue,
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
    log('hilton', 'flex calendar rendered result', {
      year,
      month,
      day: startDay,
      points: pointValue,
    });
  }

  log('hilton', 'parse complete', { year, month, resultCount: results.length });
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
      log('hilton', 'search month start', { monthSpec });
      const monthUrl = new URL(baseUrl);
      const arrivalDate = isoDateForMonthDay(monthSpec.year, monthSpec.month, 1);
      monthUrl.searchParams.set('arrivalDate', arrivalDate);
      monthUrl.searchParams.set('departureDate', addDays(arrivalDate, 5));
      monthUrl.searchParams.set('redeemPts', 'true');
      if (!monthUrl.searchParams.get('room1NumAdults')) {
        monthUrl.searchParams.set('room1NumAdults', '1');
      }

      const renderedText = await renderHiltonPageText(monthUrl.toString(), monthSpec);
      if (renderedText) {
        results.push(...parseFlexibleCalendar(renderedText, monthSpec.year, monthSpec.month, query.target.hotelName));
      } else {
        log('hilton', 'no rendered text for month', { monthSpec });
      }

      const response = await fetch(monthUrl.toString(), {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (response.ok) {
        const html = await response.text();
        results.push(...parseFlexibleCalendar(html, monthSpec.year, monthSpec.month, query.target.hotelName));
      } else {
        log('hilton', 'raw fetch failed', { monthSpec, status: response.status });
      }
    }

    log('hilton', 'search complete', { resultCount: results.length });
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
