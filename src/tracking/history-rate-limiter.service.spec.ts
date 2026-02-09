import { describe, expect, it } from 'vitest';

import { HistoryRateLimitReason, HistoryRequestSource } from './history-rate-limiter.interfaces';
import { HistoryRateLimiterService } from './history-rate-limiter.service';
import type { AppConfigService } from '../config/app-config.service';

type AppConfigServiceStub = {
  readonly historyRateLimitPerMinute: number;
  readonly historyButtonCooldownSec: number;
};

describe('HistoryRateLimiterService', (): void => {
  it('limits requests per minute and returns retryAfter', (): void => {
    const appConfigServiceStub: AppConfigServiceStub = {
      historyRateLimitPerMinute: 2,
      historyButtonCooldownSec: 3,
    };
    const service: HistoryRateLimiterService = new HistoryRateLimiterService(
      appConfigServiceStub as unknown as AppConfigService,
    );

    const firstDecision = service.evaluate('42', HistoryRequestSource.COMMAND, 1000);
    const secondDecision = service.evaluate('42', HistoryRequestSource.COMMAND, 2000);
    const thirdDecision = service.evaluate('42', HistoryRequestSource.COMMAND, 3000);

    expect(firstDecision).toEqual({
      allowed: true,
      retryAfterSec: null,
      reason: HistoryRateLimitReason.OK,
    });
    expect(secondDecision).toEqual({
      allowed: true,
      retryAfterSec: null,
      reason: HistoryRateLimitReason.OK,
    });
    expect(thirdDecision.allowed).toBe(false);
    expect(thirdDecision.reason).toBe(HistoryRateLimitReason.MINUTE_LIMIT);
    expect(thirdDecision.retryAfterSec).toBeGreaterThan(0);
  });

  it('applies callback cooldown independently', (): void => {
    const appConfigServiceStub: AppConfigServiceStub = {
      historyRateLimitPerMinute: 10,
      historyButtonCooldownSec: 3,
    };
    const service: HistoryRateLimiterService = new HistoryRateLimiterService(
      appConfigServiceStub as unknown as AppConfigService,
    );

    const firstCallbackDecision = service.evaluate('42', HistoryRequestSource.CALLBACK, 1000);
    const secondCallbackDecision = service.evaluate('42', HistoryRequestSource.CALLBACK, 2000);
    const thirdCallbackDecision = service.evaluate('42', HistoryRequestSource.CALLBACK, 4500);

    expect(firstCallbackDecision.allowed).toBe(true);
    expect(secondCallbackDecision).toEqual({
      allowed: false,
      retryAfterSec: 2,
      reason: HistoryRateLimitReason.CALLBACK_COOLDOWN,
    });
    expect(thirdCallbackDecision).toEqual({
      allowed: true,
      retryAfterSec: null,
      reason: HistoryRateLimitReason.OK,
    });
  });

  it('returns quota snapshot with usage and callback retry info', (): void => {
    const appConfigServiceStub: AppConfigServiceStub = {
      historyRateLimitPerMinute: 3,
      historyButtonCooldownSec: 3,
    };
    const service: HistoryRateLimiterService = new HistoryRateLimiterService(
      appConfigServiceStub as unknown as AppConfigService,
    );

    service.evaluate('42', HistoryRequestSource.COMMAND, 1000);
    service.evaluate('42', HistoryRequestSource.CALLBACK, 2000);
    const snapshot = service.getSnapshot('42', 2500);

    expect(snapshot).toEqual({
      minuteLimit: 3,
      minuteUsed: 2,
      minuteRemaining: 1,
      callbackCooldownSec: 3,
      callbackRetryAfterSec: 3,
    });
  });
});
