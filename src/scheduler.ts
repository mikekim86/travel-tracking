import type { RedemptionService } from './service.ts';
import { log } from './logger.ts';

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
    log('scheduler', 'started', { intervalMs: this.intervalMs, immediate });

    const tick = async (): Promise<void> => {
      if (!this.running) {
        return;
      }
      log('scheduler', 'tick start');
      await this.service.scanAllTargets();
      log('scheduler', 'tick end');
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
    log('scheduler', 'stopped');
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
