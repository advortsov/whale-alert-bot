import { Injectable } from '@nestjs/common';

import {
  HistoryRateLimitReason,
  HistoryRequestSource,
  type HistoryRateLimitDecision,
} from './history-rate-limiter.interfaces';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class HistoryRateLimiterService {
  private static readonly WINDOW_MS: number = 60_000;

  private readonly requestTimestampsByUser: Map<string, number[]> = new Map<string, number[]>();
  private readonly callbackTimestampByUser: Map<string, number> = new Map<string, number>();

  public constructor(private readonly appConfigService: AppConfigService) {}

  public evaluate(
    userId: string,
    source: HistoryRequestSource,
    nowEpochMs: number = Date.now(),
  ): HistoryRateLimitDecision {
    const requestTimestamps: number[] = this.cleanupWindow(userId, nowEpochMs);

    if (source === HistoryRequestSource.CALLBACK) {
      const callbackDecision: HistoryRateLimitDecision | null = this.evaluateCallbackCooldown(
        userId,
        nowEpochMs,
      );

      if (callbackDecision) {
        return callbackDecision;
      }
    }

    if (requestTimestamps.length >= this.appConfigService.historyRateLimitPerMinute) {
      const oldestTimestamp: number | undefined = requestTimestamps[0];
      const retryAfterMs: number = oldestTimestamp
        ? Math.max(HistoryRateLimiterService.WINDOW_MS - (nowEpochMs - oldestTimestamp), 1)
        : 1000;

      return {
        allowed: false,
        retryAfterSec: Math.max(Math.ceil(retryAfterMs / 1000), 1),
        reason: HistoryRateLimitReason.MINUTE_LIMIT,
      };
    }

    requestTimestamps.push(nowEpochMs);
    this.requestTimestampsByUser.set(userId, requestTimestamps);

    if (source === HistoryRequestSource.CALLBACK) {
      this.callbackTimestampByUser.set(userId, nowEpochMs);
    }

    return {
      allowed: true,
      retryAfterSec: null,
      reason: HistoryRateLimitReason.OK,
    };
  }

  private evaluateCallbackCooldown(
    userId: string,
    nowEpochMs: number,
  ): HistoryRateLimitDecision | null {
    const lastCallbackTimestamp: number | undefined = this.callbackTimestampByUser.get(userId);

    if (lastCallbackTimestamp === undefined) {
      return null;
    }

    const cooldownMs: number = this.appConfigService.historyButtonCooldownSec * 1000;

    if (cooldownMs <= 0) {
      return null;
    }

    const elapsedMs: number = nowEpochMs - lastCallbackTimestamp;

    if (elapsedMs >= cooldownMs) {
      return null;
    }

    const retryAfterSec: number = Math.max(Math.ceil((cooldownMs - elapsedMs) / 1000), 1);

    return {
      allowed: false,
      retryAfterSec,
      reason: HistoryRateLimitReason.CALLBACK_COOLDOWN,
    };
  }

  private cleanupWindow(userId: string, nowEpochMs: number): number[] {
    const existingTimestamps: number[] = this.requestTimestampsByUser.get(userId) ?? [];
    const threshold: number = nowEpochMs - HistoryRateLimiterService.WINDOW_MS;
    const filteredTimestamps: number[] = existingTimestamps.filter(
      (timestamp: number): boolean => timestamp > threshold,
    );

    this.requestTimestampsByUser.set(userId, filteredTimestamps);
    return filteredTimestamps;
  }
}
