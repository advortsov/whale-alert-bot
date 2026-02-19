const COMPACT_PATTERN: RegExp = /[\s_-]+/g;
const NON_ALNUM_PATTERN: RegExp = /[^a-z0-9]/g;
const DEX_HINTS: readonly { readonly hint: string; readonly value: string }[] = [
  { hint: 'uniswap', value: 'uniswap' },
  { hint: 'sushiswap', value: 'sushiswap' },
  { hint: 'pancakeswap', value: 'pancakeswap' },
  { hint: '1inch', value: '1inch' },
  { hint: 'curve', value: 'curve' },
  { hint: 'balancer', value: 'balancer' },
  { hint: 'dodo', value: 'dodo' },
  { hint: 'unknown', value: 'unknown' },
];

export const normalizeDexKey = (rawValue: string | null): string | null => {
  if (rawValue === null) {
    return null;
  }

  const trimmedValue: string = rawValue.trim().toLowerCase();

  if (trimmedValue.length === 0) {
    return null;
  }

  const compactValue: string = trimmedValue.replace(COMPACT_PATTERN, '');
  const matchedHint = DEX_HINTS.find((item): boolean => compactValue.includes(item.hint));

  if (typeof matchedHint !== 'undefined') {
    return matchedHint.value;
  }

  const sanitizedValue: string = compactValue.replace(NON_ALNUM_PATTERN, '');
  return sanitizedValue.length > 0 ? sanitizedValue : null;
};
