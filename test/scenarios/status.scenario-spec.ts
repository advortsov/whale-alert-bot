import { describe, it, expect, beforeAll } from 'vitest';

import { get } from './helpers/api-client';
import { loginAndGetTokens } from './helpers/auth-helper';

describe('Status check', () => {
  let accessToken: string;

  beforeAll(async () => {
    const tokens = await loginAndGetTokens();
    accessToken = tokens.accessToken;
  });

  it('should return user status', async () => {
    const result = await get<{
      preferences: unknown;
      settings: unknown;
      historyQuota: unknown;
    }>('/api/status', accessToken);

    expect(result.status).toBe(200);
    expect(result.body.preferences).toBeDefined();
    expect(result.body.settings).toBeDefined();
    expect(result.body.historyQuota).toBeDefined();
  });

  it('should have valid historyQuota shape', async () => {
    const result = await get<{
      historyQuota: {
        minuteUsed: number;
        minuteLimit: number;
        minuteRemaining: number;
      };
    }>('/api/status', accessToken);

    expect(result.status).toBe(200);

    const { historyQuota } = result.body;
    expect(historyQuota.minuteUsed).toBeGreaterThanOrEqual(0);
    expect(historyQuota.minuteLimit).toBeGreaterThan(0);
    expect(historyQuota.minuteRemaining).toBeGreaterThanOrEqual(0);
  });
});
