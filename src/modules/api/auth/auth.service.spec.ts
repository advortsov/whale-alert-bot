import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ITelegramLoginData } from './auth.interfaces';
import { AuthService } from './auth.service';
import type { AppConfigService } from '../../../config/app-config.service';
import type { UsersRepository } from '../../../database/repositories/users.repository';

const BOT_TOKEN = 'test-bot-token-123';
const JWT_SECRET = 'test-jwt-secret';

function buildValidLoginData(botToken: string): ITelegramLoginData {
  const authDate = Math.floor(Date.now() / 1000);
  const data: Record<string, string | number> = {
    id: 12345,
    first_name: 'Test',
    username: 'testuser',
    auth_date: authDate,
  };

  const dataCheckString = Object.entries(data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = createHash('sha256').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return { ...data, hash } as unknown as ITelegramLoginData;
}

describe('AuthService', () => {
  let authService: AuthService;
  let jwtService: JwtService;
  const mockUsersRepository = {
    findOrCreate: vi.fn().mockResolvedValue({ id: 1, telegramId: '12345' }),
  } as unknown as UsersRepository;

  const mockConfig = {
    botToken: BOT_TOKEN,
    jwtAccessTtlSec: 900,
    jwtRefreshTtlSec: 604_800,
  } as unknown as AppConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    jwtService = new JwtService({ secret: JWT_SECRET });
    authService = new AuthService(jwtService, mockConfig, mockUsersRepository);
  });

  describe('loginWithTelegram', () => {
    it('should return tokens for valid telegram login data', async () => {
      const data = buildValidLoginData(BOT_TOKEN);
      const result = await authService.loginWithTelegram(data);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockUsersRepository.findOrCreate).toHaveBeenCalledWith('12345', 'testuser');
    });

    it('should throw on invalid hash', async () => {
      const data = buildValidLoginData(BOT_TOKEN);
      const tampered = { ...data, hash: 'invalid-hash' };

      await expect(authService.loginWithTelegram(tampered)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw on expired auth_date', async () => {
      const data = buildValidLoginData(BOT_TOKEN);
      const expired = { ...data, auth_date: Math.floor(Date.now() / 1000) - 600 };

      // Recompute hash for expired auth_date
      const entries = Object.entries(expired)
        .filter(([key]) => key !== 'hash')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      const secretKey = createHash('sha256').update(BOT_TOKEN).digest();
      expired.hash = createHmac('sha256', secretKey).update(entries).digest('hex');

      await expect(
        authService.loginWithTelegram(expired as unknown as ITelegramLoginData),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when bot token is not configured', async () => {
      const configNoBotToken = {
        botToken: null,
        jwtAccessTtlSec: 900,
        jwtRefreshTtlSec: 604_800,
      } as unknown as AppConfigService;
      const serviceNoBotToken = new AuthService(jwtService, configNoBotToken, mockUsersRepository);
      const data = buildValidLoginData(BOT_TOKEN);

      await expect(serviceNoBotToken.loginWithTelegram(data)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshTokens', () => {
    it('should return new tokens for valid refresh token', async () => {
      const refreshToken = jwtService.sign(
        { sub: '12345', username: 'testuser', type: 'refresh' },
        { expiresIn: 3600 },
      );

      const result = await authService.refreshTokens(refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw for access token used as refresh', async () => {
      const accessToken = jwtService.sign(
        { sub: '12345', username: 'testuser', type: 'access' },
        { expiresIn: 3600 },
      );

      await expect(authService.refreshTokens(accessToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for invalid token', async () => {
      await expect(authService.refreshTokens('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
