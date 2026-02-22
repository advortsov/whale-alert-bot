import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac, timingSafeEqual } from 'node:crypto';

import type { IVerifiedTmaUser, ITmaUserPayload } from './tma-auth.interfaces';
import { AppConfigService } from '../../../config/app-config.service';
import { UsersRepository } from '../../../database/repositories/users.repository';
import type { IAuthTokens, IJwtPayload } from '../auth/auth.interfaces';

const MAX_AUTH_AGE_SEC: number = 300;
const TMA_HMAC_CONTEXT: string = 'WebAppData';

@Injectable()
export class TmaAuthService {
  public constructor(
    private readonly jwtService: JwtService,
    private readonly appConfigService: AppConfigService,
    private readonly usersRepository: UsersRepository,
  ) {}

  public async loginWithInitData(initDataRaw: string): Promise<IAuthTokens> {
    const verifiedUser: IVerifiedTmaUser = this.verifyInitData(initDataRaw);
    await this.usersRepository.findOrCreate(verifiedUser.telegramId, verifiedUser.username);
    return this.issueTokens(verifiedUser.telegramId, verifiedUser.username);
  }

  private verifyInitData(initDataRaw: string): IVerifiedTmaUser {
    const params: URLSearchParams = new URLSearchParams(initDataRaw);
    const hash: string = this.getRequiredParam(params, 'hash');
    const authDate: number = this.getAuthDate(params);
    const userRaw: string = this.getRequiredParam(params, 'user');

    this.verifyAuthDate(authDate);
    this.verifyHash(params, hash);
    return this.parseUser(userRaw);
  }

  private getRequiredParam(params: URLSearchParams, key: string): string {
    const value: string | null = params.get(key);

    if (value === null || value.trim().length === 0) {
      throw new UnauthorizedException(`Invalid initData: missing ${key}`);
    }

    return value;
  }

  private getAuthDate(params: URLSearchParams): number {
    const authDateRaw: string = this.getRequiredParam(params, 'auth_date');
    const authDate: number = Number.parseInt(authDateRaw, 10);

    if (!Number.isFinite(authDate) || authDate <= 0) {
      throw new UnauthorizedException('Invalid initData: auth_date is malformed');
    }

    return authDate;
  }

  private verifyHash(params: URLSearchParams, hash: string): void {
    const botToken: string | null = this.appConfigService.botToken;

    if (botToken === null) {
      throw new UnauthorizedException('Bot token is not configured');
    }

    const dataCheckString: string = this.buildDataCheckString(params);
    const secretKey: Buffer = createHmac('sha256', TMA_HMAC_CONTEXT).update(botToken).digest();
    const computedHashHex: string = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (!this.hashesEqual(computedHashHex, hash)) {
      throw new UnauthorizedException('Invalid Telegram TMA hash');
    }
  }

  private buildDataCheckString(params: URLSearchParams): string {
    const entries: [string, string][] = [];

    for (const [key, value] of params.entries()) {
      if (key !== 'hash') {
        entries.push([key, this.normalizeValueForHash(key, value)]);
      }
    }

    entries.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
    return entries.map(([key, value]) => `${key}=${value}`).join('\n');
  }

  private normalizeValueForHash(key: string, value: string): string {
    if (key !== 'query_id') {
      return value;
    }

    // Некоторые клиенты могут передать query_id с пробелами вместо "+".
    // Для проверки Telegram hash восстанавливаем исходный вид query_id.
    return value.replaceAll(' ', '+');
  }

  private hashesEqual(leftHashHex: string, rightHashHex: string): boolean {
    try {
      const leftBuffer: Buffer = Buffer.from(leftHashHex, 'hex');
      const rightBuffer: Buffer = Buffer.from(rightHashHex, 'hex');

      if (leftBuffer.length !== rightBuffer.length) {
        return false;
      }

      return timingSafeEqual(leftBuffer, rightBuffer);
    } catch {
      return false;
    }
  }

  private parseUser(userRaw: string): IVerifiedTmaUser {
    let parsedUser: unknown;

    try {
      parsedUser = JSON.parse(userRaw);
    } catch {
      throw new UnauthorizedException('Invalid initData: user is not valid JSON');
    }

    if (!this.isTmaUserPayload(parsedUser)) {
      throw new UnauthorizedException('Invalid initData: user payload is malformed');
    }

    const normalizedUsername: string | null =
      typeof parsedUser.username === 'string' && parsedUser.username.trim().length > 0
        ? parsedUser.username.trim()
        : null;

    return {
      telegramId: String(parsedUser.id),
      username: normalizedUsername,
    };
  }

  private isTmaUserPayload(value: unknown): value is ITmaUserPayload {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    if (!('id' in value) || typeof value.id !== 'number') {
      return false;
    }

    if (!Number.isInteger(value.id) || value.id <= 0) {
      return false;
    }

    if ('username' in value && value.username !== undefined && typeof value.username !== 'string') {
      return false;
    }

    return true;
  }

  private verifyAuthDate(authDate: number): void {
    const nowSec: number = Math.floor(Date.now() / 1000);

    if (nowSec - authDate > MAX_AUTH_AGE_SEC) {
      throw new UnauthorizedException('Telegram TMA initData is expired');
    }
  }

  private issueTokens(telegramId: string, username: string | null): IAuthTokens {
    const accessPayload: IJwtPayload = { sub: telegramId, username, type: 'access' };
    const refreshPayload: IJwtPayload = { sub: telegramId, username, type: 'refresh' };

    return {
      accessToken: this.jwtService.sign(accessPayload, {
        expiresIn: this.appConfigService.jwtAccessTtlSec,
      }),
      refreshToken: this.jwtService.sign(refreshPayload, {
        expiresIn: this.appConfigService.jwtRefreshTtlSec,
      }),
    };
  }
}
