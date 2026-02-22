import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TmaAuthService } from './tma-auth.service';
import type { AppConfigService } from '../../../config/app-config.service';
import type { UsersRepository } from '../../../database/repositories/users.repository';

const BOT_TOKEN: string = 'test-bot-token';
const JWT_SECRET: string = 'test-secret';
const MAX_AUTH_AGE_SEC: number = 300;

interface ITmaUserSeed {
  readonly id: number;
  readonly username?: string;
}

const buildSignedInitData = (
  botToken: string,
  userSeed: ITmaUserSeed,
  authDate: number = Math.floor(Date.now() / 1000),
): string => {
  const userJson: string = JSON.stringify(userSeed);
  const fields: Record<string, string> = {
    auth_date: String(authDate),
    query_id: 'test-query-id',
    user: userJson,
  };
  const dataCheckString: string = Object.entries(fields)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey: Buffer = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash: string = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const params: URLSearchParams = new URLSearchParams({
    ...fields,
    hash,
  });

  return params.toString();
};

describe('TmaAuthService', () => {
  let service: TmaAuthService;
  let jwtService: JwtService;

  const usersRepositoryStub = {
    findOrCreate: vi.fn().mockResolvedValue({ id: 1 }),
  } as unknown as UsersRepository;

  const configStub = {
    botToken: BOT_TOKEN,
    jwtAccessTtlSec: 900,
    jwtRefreshTtlSec: 604_800,
  } as unknown as AppConfigService;

  beforeEach((): void => {
    vi.clearAllMocks();
    jwtService = new JwtService({ secret: JWT_SECRET });
    service = new TmaAuthService(jwtService, configStub, usersRepositoryStub);
  });

  it('returns jwt tokens for valid initData', async (): Promise<void> => {
    const initData: string = buildSignedInitData(BOT_TOKEN, { id: 12345, username: 'alice' });
    const tokens = await service.loginWithInitData(initData);

    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    expect(usersRepositoryStub.findOrCreate).toHaveBeenCalledWith('12345', 'alice');
  });

  it('throws when initData is expired', async (): Promise<void> => {
    const expiredAuthDate: number = Math.floor(Date.now() / 1000) - MAX_AUTH_AGE_SEC - 1;
    const initData: string = buildSignedInitData(BOT_TOKEN, { id: 12345 }, expiredAuthDate);

    await expect(service.loginWithInitData(initData)).rejects.toThrow(UnauthorizedException);
  });

  it('throws when hash is invalid', async (): Promise<void> => {
    const params: URLSearchParams = new URLSearchParams(
      buildSignedInitData(BOT_TOKEN, { id: 12345 }),
    );
    params.set('hash', 'deadbeef');
    const initData: string = params.toString();

    await expect(service.loginWithInitData(initData)).rejects.toThrow(UnauthorizedException);
  });

  it('throws when user is missing', async (): Promise<void> => {
    const params: URLSearchParams = new URLSearchParams();
    params.set('auth_date', String(Math.floor(Date.now() / 1000)));
    params.set('query_id', 'test-query-id');
    params.set('hash', 'aabbcc');

    await expect(service.loginWithInitData(params.toString())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws when user json is malformed', async (): Promise<void> => {
    const fields: Record<string, string> = {
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: 'test-query-id',
      user: 'not-json',
    };
    const dataCheckString: string = Object.entries(fields)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const secretKey: Buffer = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const hash: string = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    const initData: string = new URLSearchParams({ ...fields, hash }).toString();

    await expect(service.loginWithInitData(initData)).rejects.toThrow(UnauthorizedException);
  });
});
