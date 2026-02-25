import {
  HistoryRateLimitReason,
  type HistoryRateLimitDecision,
} from '../entities/history-rate-limiter.interfaces';

export const buildHistoryRetryMessage = (decision: HistoryRateLimitDecision): string => {
  const retryAfterSec: number = decision.retryAfterSec ?? 1;

  if (decision.reason === HistoryRateLimitReason.CALLBACK_COOLDOWN) {
    return `Слишком часто нажимаешь кнопку истории. Повтори через ${String(retryAfterSec)} сек.`;
  }

  return `Слишком много запросов к истории. Повтори через ${String(retryAfterSec)} сек.`;
};

export const isRateLimitOrTimeout = (errorMessage: string): boolean => {
  const normalizedMessage: string = errorMessage.toLowerCase();

  return (
    normalizedMessage.includes('rate limit') ||
    normalizedMessage.includes('http 429') ||
    normalizedMessage.includes('timeout') ||
    normalizedMessage.includes('aborted') ||
    normalizedMessage.includes('too many requests')
  );
};
