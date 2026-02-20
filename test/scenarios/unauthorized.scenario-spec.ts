import { describe, it, expect } from 'vitest';

import { get, post } from './helpers/api-client';
import { buildTelegramLoginPayload, getBotToken } from './helpers/auth-helper';

describe('Auth guard — unauthorized access', () => {
  const PROTECTED_ENDPOINTS = ['/api/wallets', '/api/settings', '/api/status'];

  for (const endpoint of PROTECTED_ENDPOINTS) {
    it(`should return 401 for GET ${endpoint} without token`, async () => {
      const result = await get(endpoint);

      expect(result.status).toBe(401);
    });
  }

  it('should return 401 for GET /api/wallets with invalid token', async () => {
    const result = await get('/api/wallets', 'invalid-jwt-token');

    expect(result.status).toBe(401);
  });

  it('should allow POST /api/auth/telegram without token', async () => {
    const botToken = getBotToken();
    const payload = buildTelegramLoginPayload(botToken);

    const result = await post('/api/auth/telegram', payload);

    expect(result.status).toBe(200);
  });

  it('should allow GET /health without token', async () => {
    const result = await get('/health');

    expect(result.status).toBe(200);
  });
});
