import { describe, it, expect, beforeAll } from 'vitest';

import { get, patch } from './helpers/api-client';
import { loginAndGetTokens } from './helpers/auth-helper';

describe('Settings CRUD', () => {
  let accessToken: string;

  beforeAll(async () => {
    const tokens = await loginAndGetTokens();
    accessToken = tokens.accessToken;
  });

  it('should get current settings', async () => {
    const result = await get<{ preferences: unknown; settings: unknown }>(
      '/api/settings',
      accessToken,
    );

    expect(result.status).toBe(200);
    expect(result.body.preferences).toBeDefined();
    expect(result.body.settings).toBeDefined();
  });

  it('should update thresholdUsd', async () => {
    const result = await patch<{ settings: { thresholdUsd: number } }>(
      '/api/settings',
      { thresholdUsd: 5000 },
      accessToken,
    );

    expect(result.status).toBe(200);
    expect(result.body.settings.thresholdUsd).toBe(5000);
  });

  it('should update multiple fields', async () => {
    const result = await patch<{ settings: { cexFlowMode: string; timezone: string } }>(
      '/api/settings',
      { cexFlowMode: 'in', timezone: 'Europe/Moscow' },
      accessToken,
    );

    expect(result.status).toBe(200);
    expect(result.body.settings.cexFlowMode).toBe('in');
    expect(result.body.settings.timezone).toBe('Europe/Moscow');
  });

  it('should reject empty update body', async () => {
    const result = await patch('/api/settings', {}, accessToken);

    expect(result.status).toBe(400);
  });
});
