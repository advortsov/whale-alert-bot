import { describe, it, expect } from 'vitest';

import { post } from './helpers/api-client';
import { buildTelegramLoginPayload, getBotToken, loginAndGetTokens } from './helpers/auth-helper';

describe('Auth flow', () => {
  it('should login with valid Telegram data', async () => {
    const tokens = await loginAndGetTokens();

    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    expect(typeof tokens.accessToken).toBe('string');
    expect(typeof tokens.refreshToken).toBe('string');
  });

  it('should reject login with invalid hash', async () => {
    const botToken = getBotToken();
    const payload = buildTelegramLoginPayload(botToken);
    const tampered = { ...payload, hash: 'invalid-hash-value' };

    const result = await post('/api/auth/telegram', tampered);

    expect(result.status).toBe(401);
  });

  it('should reject login with empty body', async () => {
    const result = await post('/api/auth/telegram', {});

    expect(result.status).toBe(400);
  });

  it('should reject login with missing required fields', async () => {
    const result = await post('/api/auth/telegram', { id: 123 });

    expect(result.status).toBe(400);
  });

  it('should refresh tokens with valid refresh token', async () => {
    const tokens = await loginAndGetTokens();

    const result = await post<{ accessToken: string; refreshToken: string }>('/api/auth/refresh', {
      refreshToken: tokens.refreshToken,
    });

    expect(result.status).toBe(200);
    expect(result.body.accessToken).toBeDefined();
    expect(result.body.refreshToken).toBeDefined();
  });

  it('should reject refresh with access token instead of refresh token', async () => {
    const tokens = await loginAndGetTokens();

    const result = await post('/api/auth/refresh', {
      refreshToken: tokens.accessToken,
    });

    expect(result.status).toBe(401);
  });

  it('should reject refresh with invalid token', async () => {
    const result = await post('/api/auth/refresh', {
      refreshToken: 'totally-invalid-token',
    });

    expect(result.status).toBe(401);
  });
});
