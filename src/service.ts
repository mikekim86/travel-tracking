import { randomUUID } from 'node:crypto';
import { chooseMatchMessage, isMatch, summarizeResult, toMatchRecord } from './matching.ts';
import type {
  AppState,
  MatchRecord,
  Notifier,
  ProviderAdapter,
  ScanRecord,
  ScanSummary,
  WhatsAppContact,
  Target,
} from './types.ts';
import { buildCandidateDates } from './matching.ts';
import { JsonStore } from './store.ts';

function now(): string {
  return new Date().toISOString();
}

function trimAlertHistory(fingerprints: string[]): string[] {
  const unique = [...new Set(fingerprints)];
  return unique.slice(-50);
}

export class RedemptionService {
  private readonly store: JsonStore;
  private readonly providers: Map<string, ProviderAdapter>;
  private readonly notifier: Notifier;

  constructor(store: JsonStore, providers: Map<string, ProviderAdapter>, notifier: Notifier) {
    this.store = store;
    this.providers = providers;
    this.notifier = notifier;
  }

  async listTargets(): Promise<Target[]> {
    return this.store.listTargets();
  }

  async getTarget(id: string): Promise<Target | undefined> {
    return this.store.getTarget(id);
  }

  async createTarget(target: Target): Promise<Target> {
    const stamped = {
      ...target,
      createdAt: target.createdAt ?? now(),
      updatedAt: now(),
      alertedFingerprints: trimAlertHistory(target.alertedFingerprints ?? []),
    };
    return this.store.upsertTarget(stamped);
  }

  async updateTarget(id: string, patch: Partial<Target>): Promise<Target> {
    const target = await this.store.getTarget(id);
    if (!target) {
      throw new Error('Target not found');
    }
    const updated = {
      ...target,
      ...patch,
      id: target.id,
      createdAt: target.createdAt,
      updatedAt: now(),
      alertedFingerprints: trimAlertHistory(patch.alertedFingerprints ?? target.alertedFingerprints),
    } as Target;
    return this.store.upsertTarget(updated);
  }

  async deleteTarget(id: string): Promise<boolean> {
    return this.store.deleteTarget(id);
  }

  async scanTarget(targetId: string): Promise<ScanSummary> {
    const target = await this.store.getTarget(targetId);
    if (!target) {
      throw new Error('Target not found');
    }
    return this.scanOne(target);
  }

  async scanAllTargets(): Promise<ScanSummary[]> {
    const targets = await this.store.listTargets();
    const summaries: ScanSummary[] = [];
    for (const target of targets) {
      if (target.status !== 'active') {
        continue;
      }
      summaries.push(await this.scanOne(target));
    }
    return summaries;
  }

  async getState(): Promise<AppState> {
    return this.store.load();
  }

  async getScans(): Promise<ScanRecord[]> {
    return this.store.listScans();
  }

  async listContacts(): Promise<WhatsAppContact[]> {
    return this.store.listContacts();
  }

  async getContact(id: string): Promise<WhatsAppContact | undefined> {
    return this.store.getContact(id);
  }

  async upsertContact(contact: WhatsAppContact): Promise<WhatsAppContact> {
    return this.store.upsertContact(contact);
  }

  async deleteContact(id: string): Promise<boolean> {
    return this.store.deleteContact(id);
  }

  private async scanOne(target: Target): Promise<ScanSummary> {
    const startedAt = now();
    const scanId = randomUUID();
    const provider = this.providers.get(target.providerId);

    if (!provider) {
      const scan: ScanRecord = {
        id: scanId,
        targetId: target.id,
        startedAt,
        finishedAt: now(),
        outcome: 'error',
        matches: [],
        error: `Unknown provider: ${target.providerId}`,
      };
      await this.store.addScan(scan);
      await this.updateScanMeta(target, 'error', scan.error);
      return { targetId: target.id, outcome: 'error', matches: [], error: scan.error };
    }

    try {
      const candidateDates = buildCandidateDates(target);
      const results = await provider.search({ target, candidateDates });
      const matches: MatchRecord[] = [];

      for (const result of results) {
        if (!isMatch(target, result)) {
          continue;
        }
        const match = toMatchRecord(target, result);
        matches.push(match);
        if (!target.alertedFingerprints.includes(match.fingerprint)) {
          await this.notifier.send(chooseMatchMessage(target, match));
          target.alertedFingerprints = trimAlertHistory([
            ...target.alertedFingerprints,
            match.fingerprint,
          ]);
        }
      }

      const outcome = matches.length > 0 ? 'matched' : 'no_match';
      const scan: ScanRecord = {
        id: scanId,
        targetId: target.id,
        startedAt,
        finishedAt: now(),
        outcome,
        matches,
      };
      await this.store.addScan(scan);
      await this.updateScanMeta(target, outcome);
      return { targetId: target.id, outcome, matches };
    } catch (error) {
      const message = (error as Error).message;
      const scan: ScanRecord = {
        id: scanId,
        targetId: target.id,
        startedAt,
        finishedAt: now(),
        outcome: 'error',
        matches: [],
        error: message,
      };
      await this.store.addScan(scan);
      await this.updateScanMeta(target, 'error', message);
      return { targetId: target.id, outcome: 'error', matches: [], error: message };
    }
  }

  private async updateScanMeta(
    target: Target,
    outcome: 'matched' | 'no_match' | 'error',
    error?: string,
  ): Promise<void> {
    const updated = {
      ...target,
      updatedAt: now(),
      lastScannedAt: now(),
      lastScanOutcome: outcome,
      lastScanError: error,
      alertedFingerprints: trimAlertHistory(target.alertedFingerprints),
    } as Target;
    await this.store.upsertTarget(updated);
  }

  getNextScanAt(lastScanAt: string | undefined, intervalHours: number): string | undefined {
    if (!lastScanAt) {
      return undefined;
    }
    const last = new Date(lastScanAt);
    last.setHours(last.getHours() + intervalHours);
    return last.toISOString();
  }
}
