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
