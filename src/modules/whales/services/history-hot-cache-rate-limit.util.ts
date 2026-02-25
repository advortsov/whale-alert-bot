import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';

export const isRateLimitHistoryError = (errorMessage: string): boolean => {
  const normalizedMessage: string = errorMessage.toLowerCase();
  return (
    normalizedMessage.includes(' 429') ||
    normalizedMessage.includes('http 429') ||
    normalizedMessage.includes('rate exceeded') ||
    normalizedMessage.includes('rate limit')
  );
};

export const getChainCooldownRemainingMs = (
  chainCooldownUntilMs: Map<ChainKey, number>,
  chainKey: ChainKey,
  nowEpochMs: number,
): number => {
  const cooldownUntilMs: number | undefined = chainCooldownUntilMs.get(chainKey);

  if (cooldownUntilMs === undefined || cooldownUntilMs <= nowEpochMs) {
    chainCooldownUntilMs.delete(chainKey);
    return 0;
  }

  return cooldownUntilMs - nowEpochMs;
};

export const setChainCooldown = (
  chainCooldownUntilMs: Map<ChainKey, number>,
  chainKey: ChainKey,
  nowEpochMs: number,
  cooldownMs: number,
): boolean => {
  const nextCooldownUntilMs: number = nowEpochMs + cooldownMs;
  const currentCooldownUntilMs: number = chainCooldownUntilMs.get(chainKey) ?? 0;

  if (nextCooldownUntilMs <= currentCooldownUntilMs) {
    return false;
  }

  chainCooldownUntilMs.set(chainKey, nextCooldownUntilMs);
  return true;
};
