import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboardPage } from '../src/ui.ts';
import type { AppState } from '../src/types.ts';

test('renders the dashboard shell and target data', () => {
  const state: AppState = {
    targets: [
      {
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
      },
    ],
    scans: [],
    contacts: [],
  };

  const html = renderDashboardPage(state, {
    targets: 1,
    activeTargets: 1,
    scans: 0,
    nextPollHours: 12,
  }, ['2026-06-05T00:00:00.000Z [hilton] test log']);

  assert.match(html, /Travel Redemption Watcher/);
  assert.match(html, /Award tracking dashboard/);
  assert.match(html, /Hilton Waikiki/);
  assert.match(html, /Scan all now/);
  assert.match(html, /Alert contacts/);
  assert.match(html, /Recent logs/);
  assert.match(html, /\[hilton\] test log/);
});
