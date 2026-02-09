export enum HistoryRequestSource {
  COMMAND = 'command',
  CALLBACK = 'callback',
}

export enum HistoryRateLimitReason {
  OK = 'ok',
  MINUTE_LIMIT = 'minute_limit',
  CALLBACK_COOLDOWN = 'callback_cooldown',
}

export type HistoryRateLimitDecision = {
  readonly allowed: boolean;
  readonly retryAfterSec: number | null;
  readonly reason: HistoryRateLimitReason;
};
