import type { ITronGridListResponse } from './tron-grid-history.interfaces';

const normalizeNonEmptyString = (rawValue: unknown): string | null => {
  if (typeof rawValue !== 'string') {
    return null;
  }

  const normalizedValue: string = rawValue.trim();
  return normalizedValue.length === 0 ? null : normalizedValue;
};

export const readTronHistoryResponseDetails = async (
  response: Response,
  maxLength: number,
): Promise<string> => {
  try {
    const responseText: string = (await response.text()).trim();

    if (responseText.length === 0) {
      return '';
    }

    const normalizedResponseText: string = responseText.replace(/\s+/g, ' ');
    return normalizedResponseText.slice(0, maxLength);
  } catch {
    return '';
  }
};

export const resolveTronHistoryResponseData = (
  payload: ITronGridListResponse<unknown>,
): readonly unknown[] => {
  if (!Array.isArray(payload.data)) {
    throw new Error('TRON history response payload has invalid data field.');
  }

  return payload.data;
};

export const resolveTronHistoryNextFingerprint = (
  payload: ITronGridListResponse<unknown>,
): string | null => {
  const directFingerprint: string | null = normalizeNonEmptyString(payload.meta?.fingerprint);

  if (directFingerprint !== null) {
    return directFingerprint;
  }

  const nextLink: string | null = normalizeNonEmptyString(payload.meta?.links?.next);

  if (nextLink === null) {
    return null;
  }

  try {
    const nextUrl: URL = new URL(nextLink);
    return normalizeNonEmptyString(nextUrl.searchParams.get('fingerprint'));
  } catch {
    return null;
  }
};
