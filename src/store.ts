import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppState, ScanRecord, Target, WhatsAppContact } from './types.ts';

function defaultState(): AppState {
  return { targets: [], scans: [], contacts: [] };
}

export class JsonStore {
  private writeChain: Promise<void> = Promise.resolve();
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async ensureDir(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
  }

  async load(): Promise<AppState> {
    try {
      const content = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(content) as AppState;
      return {
        targets: Array.isArray(parsed.targets) ? parsed.targets : [],
        scans: Array.isArray(parsed.scans) ? parsed.scans : [],
        contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return defaultState();
      }
      throw error;
    }
  }

  async save(state: AppState): Promise<void> {
    await this.ensureDir();
    const payload = `${JSON.stringify(state, null, 2)}\n`;
    const tempPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, payload, 'utf8');
    await rename(tempPath, this.filePath);
  }

  async update(mutator: (state: AppState) => AppState | Promise<AppState>): Promise<AppState> {
    const next = this.writeChain.then(async () => {
      const state = await this.load();
      const updated = await mutator(state);
      await this.save(updated);
      return updated;
    });

    this.writeChain = next.then(() => undefined, () => undefined);
    return next;
  }

  async listTargets(): Promise<Target[]> {
    const state = await this.load();
    return state.targets;
  }

  async getTarget(id: string): Promise<Target | undefined> {
    const state = await this.load();
    return state.targets.find((target) => target.id === id);
  }

  async upsertTarget(target: Target): Promise<Target> {
    await this.update((state) => {
      const index = state.targets.findIndex((entry) => entry.id === target.id);
      if (index === -1) {
        state.targets.push(target);
      } else {
        state.targets[index] = target;
      }
      return state;
    });
    return target;
  }

  async deleteTarget(id: string): Promise<boolean> {
    let deleted = false;
    await this.update((state) => {
      const before = state.targets.length;
      state.targets = state.targets.filter((target) => target.id !== id);
      deleted = state.targets.length !== before;
      return state;
    });
    return deleted;
  }

  async addScan(scan: ScanRecord): Promise<ScanRecord> {
    await this.update((state) => {
      state.scans.push(scan);
      return state;
    });
    return scan;
  }

  async listScans(): Promise<ScanRecord[]> {
    const state = await this.load();
    return state.scans;
  }

  async listContacts(): Promise<WhatsAppContact[]> {
    const state = await this.load();
    return state.contacts;
  }

  async getContact(id: string): Promise<WhatsAppContact | undefined> {
    const state = await this.load();
    return state.contacts.find((contact) => contact.id === id);
  }

  async upsertContact(contact: WhatsAppContact): Promise<WhatsAppContact> {
    await this.update((state) => {
      const index = state.contacts.findIndex((entry) => entry.id === contact.id);
      if (index === -1) {
        state.contacts.push(contact);
      } else {
        state.contacts[index] = contact;
      }
      return state;
    });
    return contact;
  }

  async deleteContact(id: string): Promise<boolean> {
    let deleted = false;
    await this.update((state) => {
      const before = state.contacts.length;
      state.contacts = state.contacts.filter((contact) => contact.id !== id);
      deleted = state.contacts.length !== before;
      return state;
    });
    return deleted;
  }
}
