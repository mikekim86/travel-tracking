import type { RedemptionService } from './service.ts';

export class PollingScheduler {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly service: RedemptionService;
  private readonly intervalMs: number;

  constructor(service: RedemptionService, intervalMs: number) {
    this.service = service;
    this.intervalMs = intervalMs;
  }

  start(immediate = true): void {
    if (this.running) {
      return;
    }
    this.running = true;

    const tick = async (): Promise<void> => {
      if (!this.running) {
        return;
      }
      await this.service.scanAllTargets();
    };

    if (immediate) {
      void tick();
    }
    this.timer = setInterval(() => {
      void tick();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
