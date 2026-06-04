import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AirlineTarget, DatePreference, HotelTarget, Target, WhatsAppContact } from './types.ts';
import { JsonStore } from './store.ts';
import { HiltonPublicProvider, ProviderRegistry } from './providers.ts';
import { ConsoleNotifier, MetaWhatsAppClient } from './notifier.ts';
import { PollingScheduler } from './scheduler.ts';
import { RedemptionService } from './service.ts';
import type { Notifier } from './types.ts';
import { renderDashboardPage } from './ui.ts';

export interface AppConfig {
  dataFile: string;
  pollIntervalHours: number;
  whatsappMode: 'meta' | 'console';
  whatsappPhoneNumberId?: string;
  whatsappAccessToken?: string;
  whatsappTo?: string;
  providers?: ProviderRegistry;
  notifier?: Notifier;
}

export interface TravelWatcherApp {
  service: RedemptionService;
  scheduler: PollingScheduler;
  server: ReturnType<typeof createServer>;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) {
    return undefined;
  }
  return JSON.parse(text);
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload, null, 2));
}

function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message });
}

function normalizeDatePreference(input: unknown): DatePreference {
  if (!input || typeof input !== 'object') {
    throw new Error('datePreference is required');
  }
  const candidate = input as Record<string, unknown>;
  if (candidate.kind === 'exact' && Array.isArray(candidate.dates)) {
    return { kind: 'exact', dates: candidate.dates.map(String) };
  }
  if (
    candidate.kind === 'month' &&
    Number.isInteger(candidate.year) &&
    Number.isInteger(candidate.month)
  ) {
    return { kind: 'month', year: Number(candidate.year), month: Number(candidate.month) };
  }
  if (
    candidate.kind === 'range' &&
    typeof candidate.startDate === 'string' &&
    typeof candidate.endDate === 'string'
  ) {
    return {
      kind: 'range',
      startDate: candidate.startDate,
      endDate: candidate.endDate,
    };
  }
  throw new Error('Invalid datePreference');
}

function normalizeTarget(payload: Record<string, unknown>): Target {
  const base = {
    id: typeof payload.id === 'string' ? payload.id : randomUUID(),
    providerId: typeof payload.providerId === 'string' ? payload.providerId : '',
    name: typeof payload.name === 'string' ? payload.name : '',
    status: payload.status === 'paused' ? 'paused' : 'active',
    datePreference: normalizeDatePreference(payload.datePreference),
    createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    alertedFingerprints: Array.isArray(payload.alertedFingerprints)
      ? payload.alertedFingerprints.map(String)
      : [],
  };

  if (payload.type === 'hotel') {
    const target: HotelTarget = {
      ...base,
      type: 'hotel',
      hotelName: typeof payload.hotelName === 'string' ? payload.hotelName : '',
      maxPoints: Number(payload.maxPoints ?? 0),
      publicSearchUrl: typeof payload.publicSearchUrl === 'string' ? payload.publicSearchUrl : undefined,
    };
    return target;
  }

  if (payload.type === 'airline') {
    const routePayload = (payload.route ?? {}) as Record<string, unknown>;
    const target: AirlineTarget = {
      ...base,
      type: 'airline',
      airline: typeof payload.airline === 'string' ? payload.airline : '',
      route: {
        origin: typeof routePayload.origin === 'string' ? routePayload.origin : '',
        destination: typeof routePayload.destination === 'string' ? routePayload.destination : '',
      },
      cabinClass: typeof payload.cabinClass === 'string' ? payload.cabinClass : '',
    };
    return target;
  }

  throw new Error('Invalid target type');
}

function normalizeContact(payload: Record<string, unknown>): WhatsAppContact {
  return {
    id: typeof payload.id === 'string' ? payload.id : randomUUID(),
    name: typeof payload.name === 'string' ? payload.name : '',
    phoneNumber: typeof payload.phoneNumber === 'string' ? payload.phoneNumber : '',
    createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enabled: payload.enabled === false ? false : true,
  };
}

function makeNotifier(config: AppConfig, store: JsonStore) {
  if (config.notifier) {
    return config.notifier;
  }
  if (config.whatsappMode === 'meta' && config.whatsappPhoneNumberId && config.whatsappAccessToken) {
    const client = new MetaWhatsAppClient(config.whatsappPhoneNumberId, config.whatsappAccessToken);
    const notifier: Notifier = {
      async send(message: string): Promise<void> {
        const contacts = (await store.listContacts()).filter(
          (contact) => contact.enabled && contact.phoneNumber.trim().length > 0,
        );
        const recipients = contacts.map((contact) => contact.phoneNumber);
        const uniqueRecipients = [...new Set(recipients)];
        if (uniqueRecipients.length === 0 && config.whatsappTo) {
          uniqueRecipients.push(config.whatsappTo);
        }
        if (uniqueRecipients.length === 0) {
          throw new Error('No WhatsApp recipients configured');
        }
        for (const recipient of uniqueRecipients) {
          await client.sendTo(recipient, message);
        }
      },
    };
    return notifier;
  }
  return new ConsoleNotifier();
}

export async function createTravelWatcherApp(config: AppConfig): Promise<TravelWatcherApp> {
  const store = new JsonStore(config.dataFile);
  const providers = config.providers ?? new ProviderRegistry();
  if (!providers.get('hilton-public')) {
    providers.register(new HiltonPublicProvider());
  }
  const notifier = makeNotifier(config, store);
  const service = new RedemptionService(store, new Map(providers.list().map((p) => [p.id, p])), notifier);
  const scheduler = new PollingScheduler(service, config.pollIntervalHours * 60 * 60 * 1000);
  const testMessage = 'Test alert from Travel Redemption Watcher';

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/dashboard')) {
        const state = await service.getState();
        const status = {
          targets: state.targets.length,
          activeTargets: state.targets.filter((target) => target.status === 'active').length,
          scans: state.scans.length,
          nextPollHours: config.pollIntervalHours,
        };
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(renderDashboardPage(state, status));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/status') {
        const state = await service.getState();
        sendJson(res, 200, {
          targets: state.targets.length,
          activeTargets: state.targets.filter((target) => target.status === 'active').length,
          scans: state.scans.length,
          nextPollHours: config.pollIntervalHours,
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/targets') {
        sendJson(res, 200, await service.listTargets());
        return;
      }

      if (req.method === 'GET' && url.pathname === '/contacts') {
        sendJson(res, 200, await service.listContacts());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/test-message') {
        await notifier.send(testMessage);
        sendJson(res, 200, { sent: true, message: testMessage });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/targets') {
        const payload = (await readBody(req)) as Record<string, unknown>;
        const target = normalizeTarget(payload);
        if (!target.providerId) {
          throw new Error('providerId is required');
        }
        sendJson(res, 201, await service.createTarget(target));
        return;
      }

      const targetMatch = url.pathname.match(/^\/targets\/([^/]+)$/);
      if (targetMatch && req.method === 'GET') {
        const target = await service.getTarget(targetMatch[1]);
        if (!target) {
          sendError(res, 404, 'Target not found');
          return;
        }
        sendJson(res, 200, target);
        return;
      }

      if (targetMatch && req.method === 'PUT') {
        const payload = (await readBody(req)) as Record<string, unknown>;
        const patch = normalizeTarget({ ...payload, id: targetMatch[1] });
        sendJson(res, 200, await service.updateTarget(targetMatch[1], patch));
        return;
      }

      if (targetMatch && req.method === 'DELETE') {
        const deleted = await service.deleteTarget(targetMatch[1]);
        if (!deleted) {
          sendError(res, 404, 'Target not found');
          return;
        }
        sendJson(res, 200, { deleted: true });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/contacts') {
        const payload = (await readBody(req)) as Record<string, unknown>;
        const contact = normalizeContact(payload);
        if (!contact.phoneNumber.trim()) {
          throw new Error('phoneNumber is required');
        }
        if (!contact.name.trim()) {
          throw new Error('name is required');
        }
        sendJson(res, 201, await service.upsertContact(contact));
        return;
      }

      const contactMatch = url.pathname.match(/^\/contacts\/([^/]+)$/);
      if (contactMatch && req.method === 'GET') {
        const contact = await service.getContact(contactMatch[1]);
        if (!contact) {
          sendError(res, 404, 'Contact not found');
          return;
        }
        sendJson(res, 200, contact);
        return;
      }

      if (contactMatch && req.method === 'PUT') {
        const payload = (await readBody(req)) as Record<string, unknown>;
        const contact = normalizeContact({ ...payload, id: contactMatch[1] });
        sendJson(res, 200, await service.upsertContact(contact));
        return;
      }

      if (contactMatch && req.method === 'DELETE') {
        const deleted = await service.deleteContact(contactMatch[1]);
        if (!deleted) {
          sendError(res, 404, 'Contact not found');
          return;
        }
        sendJson(res, 200, { deleted: true });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/scan') {
        const payload = (await readBody(req)) as Record<string, unknown> | undefined;
        if (payload?.targetId && typeof payload.targetId === 'string') {
          sendJson(res, 200, await service.scanTarget(payload.targetId));
        } else {
          sendJson(res, 200, await service.scanAllTargets());
        }
        return;
      }

      if (req.method === 'GET' && url.pathname === '/scans') {
        sendJson(res, 200, await service.getScans());
        return;
      }

      sendError(res, 404, 'Not found');
    } catch (error) {
      sendError(res, 400, (error as Error).message);
    }
  });

  return { service, scheduler, server };
}

export function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createDefaultConfig(): AppConfig {
  return {
    dataFile: process.env.DATA_DIR ? `${process.env.DATA_DIR}/state.json` : './data/state.json',
    pollIntervalHours: parsePort(process.env.POLL_INTERVAL_HOURS, 12),
    whatsappMode: (process.env.WHATSAPP_MODE === 'meta' ? 'meta' : 'console') as 'meta' | 'console',
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    whatsappTo: process.env.WHATSAPP_TO,
  };
}
