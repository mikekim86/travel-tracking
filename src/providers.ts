import type { ProviderAdapter, ProviderQuery, ProviderResult } from './types.ts';
import { searchHiltonPublic } from './hilton.ts';

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderAdapter>();

  register(provider: ProviderAdapter): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): ProviderAdapter | undefined {
    return this.providers.get(id);
  }

  list(): ProviderAdapter[] {
    return [...this.providers.values()];
  }
}

export class StaticProvider implements ProviderAdapter {
  readonly id: string;
  private readonly results: ProviderResult[];

  constructor(id: string, results: ProviderResult[] = []) {
    this.id = id;
    this.results = results;
  }

  async search(query: ProviderQuery): Promise<ProviderResult[]> {
    return this.results.filter((result) => result.providerId === this.id);
  }
}

export class HiltonPublicProvider implements ProviderAdapter {
  readonly id = 'hilton-public';

  async search(query: ProviderQuery): Promise<ProviderResult[]> {
    return searchHiltonPublic(query);
  }
}
