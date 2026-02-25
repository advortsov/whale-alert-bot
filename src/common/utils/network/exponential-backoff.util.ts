const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 60_000;
const BACKOFF_MULTIPLIER = 2;

export interface IExponentialBackoffOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly shouldRetry: (error: unknown, attempt: number) => boolean;
  readonly onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const sleep = async (delayMs: number): Promise<void> => {
  if (delayMs <= 0) {
    return;
  }

  await new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, delayMs);
  });
};

const resolveMaxAttempts = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_ATTEMPTS;
  }

  return Math.floor(value);
};

const resolveBaseDelayMs = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_BASE_DELAY_MS;
  }

  return Math.floor(value);
};

const resolveMaxDelayMs = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_DELAY_MS;
  }

  return Math.floor(value);
};

export const executeWithExponentialBackoff = async <TResult>(
  operation: () => Promise<TResult>,
  options: IExponentialBackoffOptions,
): Promise<TResult> => {
  const maxAttempts: number = resolveMaxAttempts(options.maxAttempts);
  const baseDelayMs: number = resolveBaseDelayMs(options.baseDelayMs);
  const maxDelayMs: number = resolveMaxDelayMs(options.maxDelayMs);
  let currentDelayMs: number = baseDelayMs;

  for (let attempt: number = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      const shouldRetry: boolean = attempt < maxAttempts && options.shouldRetry(error, attempt);

      if (!shouldRetry) {
        throw error;
      }

      options.onRetry?.(error, attempt, currentDelayMs);
      await sleep(currentDelayMs);
      currentDelayMs = Math.min(currentDelayMs * BACKOFF_MULTIPLIER, maxDelayMs);
    }
  }

  throw new Error('Unreachable backoff branch');
};
