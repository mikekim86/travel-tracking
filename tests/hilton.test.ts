import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHiltonSearchUrl, searchHiltonPublic } from '../src/hilton.ts';

test('builds a public Hilton search URL for one night', () => {
  const url = buildHiltonSearchUrl(
    'https://www.hilton.com/en/book/reservation/rooms/?ctyhocn=MLEONWA&arrivalDate=2027-02-12&departureDate=2027-02-16&redeemPts=true&room1NumAdults=1',
    '2027-02-12',
  );

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('ctyhocn'), 'MLEONWA');
  assert.equal(parsed.searchParams.get('arrivalDate'), '2027-02-12');
  assert.equal(parsed.searchParams.get('departureDate'), '2027-02-13');
  assert.equal(parsed.searchParams.get('redeemPts'), 'true');
  assert.equal(parsed.searchParams.get('room1NumAdults'), '1');
});

test('parses public Hilton points from html text', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const html = `
      <html>
        <body>
          <div>Standard award night from 150,000 points</div>
          <script>{"pointsPerNight":"200000","roomName":"Deluxe Villa"}</script>
        </body>
      </html>
    `;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
  }) as typeof fetch;

  try {
    const results = await searchHiltonPublic({
      target: {
        id: 'hotel-1',
        type: 'hotel',
        providerId: 'hilton-public',
        name: 'Waldorf Astoria Maldives Ithaafushi',
        hotelName: 'Waldorf Astoria Maldives Ithaafushi',
        maxPoints: 200000,
        publicSearchUrl:
          'https://www.hilton.com/en/book/reservation/rooms/?ctyhocn=MLEONWA&arrivalDate=2027-02-12&departureDate=2027-02-16&redeemPts=true&room1NumAdults=1',
        status: 'active',
        datePreference: { kind: 'range', startDate: '2027-02-12', endDate: '2027-02-16' },
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:00.000Z',
        alertedFingerprints: [],
      },
      candidateDates: ['2027-02-12'],
    });

    assert.equal(results.length, 2);
    assert.equal(results[0].available, true);
    assert.equal(results[0].hotelName, 'Waldorf Astoria Maldives Ithaafushi');
    assert.equal(results[0].providerId, 'hilton-public');
    assert.deepEqual(
      results.map((result) => result.points).sort((a, b) => a - b),
      [150000, 200000],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('parses flexible-dates calendar availability for April 2027', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const html = `
      <html>
        <body>
          <h1>April 2027</h1>
          <div>1 - 6</div>
          <div>5 night stay unavailable</div>
          <div>2 - 7</div>
          <div>250000 points</div>
        </body>
      </html>
    `;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
  }) as typeof fetch;

  try {
    const results = await searchHiltonPublic({
      target: {
        id: 'hotel-1',
        type: 'hotel',
        providerId: 'hilton-public',
        name: 'Waldorf Astoria Maldives Ithaafushi',
        hotelName: 'Waldorf Astoria Maldives Ithaafushi',
        maxPoints: 250000,
        publicSearchUrl:
          'https://www.hilton.com/en/book/reservation/flexibledates/?ctyhocn=MLEONWA&arrivalDate=2027-02-12&departureDate=2027-02-16&redeemPts=true&room1NumAdults=1',
        status: 'active',
        datePreference: { kind: 'months', months: [{ year: 2027, month: 4 }] },
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:00.000Z',
        alertedFingerprints: [],
      },
      candidateDates: ['2027-04-01', '2027-04-02'],
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].date, '2027-04-02');
    assert.equal(results[0].points, 250000);
    assert.equal(results[0].hotelName, 'Waldorf Astoria Maldives Ithaafushi');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('parses flexible-dates calendar availability for multiple months', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    const url = new URL(String(input));
    const arrivalDate = url.searchParams.get('arrivalDate');
    const html =
      arrivalDate === '2027-04-01'
        ? `
          <html>
            <body>
              <h1>April 2027</h1>
              <div>1 - 6</div>
              <div>250000 points</div>
            </body>
          </html>
        `
        : `
          <html>
            <body>
              <h1>May 2027</h1>
              <div>1 - 6</div>
              <div>5 night stay unavailable</div>
            </body>
          </html>
        `;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
  }) as typeof fetch;

  try {
    const results = await searchHiltonPublic({
      target: {
        id: 'hotel-1',
        type: 'hotel',
        providerId: 'hilton-public',
        name: 'Waldorf Astoria Maldives Ithaafushi',
        hotelName: 'Waldorf Astoria Maldives Ithaafushi',
        maxPoints: 250000,
        publicSearchUrl:
          'https://www.hilton.com/en/book/reservation/flexibledates/?ctyhocn=MLEONWA&arrivalDate=2027-02-12&departureDate=2027-02-16&redeemPts=true&room1NumAdults=1',
        status: 'active',
        datePreference: {
          kind: 'months',
          months: [
            { year: 2027, month: 4 },
            { year: 2027, month: 5 },
          ],
        },
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:00.000Z',
        alertedFingerprints: [],
      },
      candidateDates: ['2027-04-01', '2027-05-01'],
    });

    assert.equal(requestedUrls.length, 2);
    assert.ok(requestedUrls.some((url) => url.includes('arrivalDate=2027-04-01')));
    assert.ok(requestedUrls.some((url) => url.includes('arrivalDate=2027-05-01')));
    assert.equal(results.length, 1);
    assert.equal(results[0].date, '2027-04-01');
    assert.equal(results[0].points, 250000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
