import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTravelWatcherApp } from '../src/app.ts';
import { ProviderRegistry, StaticProvider } from '../src/providers.ts';
import type { AirlineTarget, HotelTarget, ProviderResult } from '../src/types.ts';

class MemoryNotifier {
  messages: string[] = [];
  async send(message: string): Promise<void> {
    this.messages.push(message);
  }
}

function hotelTarget(): HotelTarget {
  return {
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
}

function airlineTarget(): AirlineTarget {
  return {
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
}

test('scan sends a single alert for a new match and suppresses repeats', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-watcher-'));
  const dataFile = join(dir, 'state.json');
  const providerResults: ProviderResult[] = [
    {
      providerId: 'mock',
      kind: 'hotel',
      hotelName: 'Hilton Waikiki',
      date: '2026-07-10',
      points: 48000,
      available: true,
      title: 'Hilton Waikiki',
    },
  ];
  const registry = new ProviderRegistry();
  registry.register(new StaticProvider('mock', providerResults));

  const notifier = new MemoryNotifier();
  const app = await createTravelWatcherApp({
    dataFile,
    pollIntervalHours: 12,
    whatsappMode: 'console',
    notifier,
    providers: registry,
  });
  await app.service.createTarget(hotelTarget());

  const first = await app.service.scanTarget('hotel-1');
  const second = await app.service.scanTarget('hotel-1');

  assert.equal(first.outcome, 'matched');
  assert.equal(second.outcome, 'matched');

  const state = await app.service.getState();
  assert.equal(state.targets[0].lastScanOutcome, 'matched');
  assert.equal(state.scans.length >= 2, true);
  assert.equal(notifier.messages.length, 1);

  const stored = JSON.parse(await readFile(dataFile, 'utf8')) as { scans: unknown[] };
  assert.equal(stored.scans.length >= 2, true);
});

test('api can create and list targets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-watcher-'));
  const dataFile = join(dir, 'state.json');
  const app = await createTravelWatcherApp({
    dataFile,
    pollIntervalHours: 12,
    whatsappMode: 'console',
  });

  await app.service.createTarget(airlineTarget());
  const targets = await app.service.listTargets();
  assert.equal(targets.length, 1);
  assert.equal(targets[0].type, 'airline');
});

test('meta notifier sends alerts to saved whatsapp contacts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-watcher-'));
  const dataFile = join(dir, 'state.json');
  const providerResults: ProviderResult[] = [
    {
      providerId: 'mock',
      kind: 'hotel',
      hotelName: 'Hilton Waikiki',
      date: '2026-07-10',
      points: 48000,
      available: true,
      title: 'Hilton Waikiki',
    },
  ];
  const registry = new ProviderRegistry();
  registry.register(new StaticProvider('mock', providerResults));

  const postedRecipients: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    if (body?.to) {
      postedRecipients.push(body.to);
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    const app = await createTravelWatcherApp({
      dataFile,
      pollIntervalHours: 12,
      whatsappMode: 'meta',
      whatsappPhoneNumberId: '123',
      whatsappAccessToken: 'token',
      providers: registry,
    });

    await app.service.createTarget(hotelTarget());
    await app.service.upsertContact({
      id: 'contact-1',
      name: 'Mike',
      phoneNumber: '+15555555555',
      enabled: true,
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    });

    await app.service.scanTarget('hotel-1');
    assert.deepEqual(postedRecipients, ['+15555555555']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
