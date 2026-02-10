const COMPACT_PATTERN: RegExp = /[\s_-]+/g;
const NON_ALNUM_PATTERN: RegExp = /[^a-z0-9]/g;

export const normalizeDexKey = (rawValue: string | null): string | null => {
  if (rawValue === null) {
    return null;
  }

  const trimmedValue: string = rawValue.trim().toLowerCase();

  if (trimmedValue.length === 0) {
    return null;
  }

  const compactValue: string = trimmedValue.replace(COMPACT_PATTERN, '');

  if (compactValue.includes('uniswap')) {
    return 'uniswap';
  }

  if (compactValue.includes('sushiswap')) {
    return 'sushiswap';
  }

  if (compactValue.includes('pancakeswap')) {
    return 'pancakeswap';
  }

  if (compactValue.includes('1inch')) {
    return '1inch';
  }

  if (compactValue.includes('curve')) {
    return 'curve';
  }

  if (compactValue.includes('balancer')) {
    return 'balancer';
  }

  if (compactValue.includes('dodo')) {
    return 'dodo';
  }

  if (compactValue.includes('unknown')) {
    return 'unknown';
  }

  const sanitizedValue: string = compactValue.replace(NON_ALNUM_PATTERN, '');
  return sanitizedValue.length > 0 ? sanitizedValue : null;
};
