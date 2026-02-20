import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac, createHash } from 'node:crypto';

import type { IAuthTokens, IJwtPayload, ITelegramLoginData } from './auth.interfaces';
import { AppConfigService } from '../../../config/app-config.service';
import { UsersRepository } from '../../../database/repositories/users.repository';

const MAX_AUTH_AGE_SEC = 300;

@Injectable()
export class AuthService {
  public constructor(
    private readonly jwtService: JwtService,
    private readonly appConfigService: AppConfigService,
    private readonly usersRepository: UsersRepository,
  ) {}

  public async loginWithTelegram(data: ITelegramLoginData): Promise<IAuthTokens> {
    this.verifyTelegramHash(data);
    this.verifyAuthDate(data.auth_date);

    const telegramId: string = String(data.id);
    const username: string | null = data.username ?? null;
    await this.usersRepository.findOrCreate(telegramId, username);

    return this.issueTokens(telegramId, username);
  }

  public async refreshTokens(refreshToken: string): Promise<IAuthTokens> {
    const payload: IJwtPayload = this.verifyRefreshToken(refreshToken);
    return this.issueTokens(payload.sub, payload.username);
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

  private verifyTelegramHash(data: ITelegramLoginData): void {
    const botToken: string | null = this.appConfigService.botToken;

    if (botToken === null) {
      throw new UnauthorizedException('Bot token is not configured');
    }

    const entries: [string, string][] = Object.entries(data)
      .filter(([key]) => key !== 'hash')
      .map(([key, value]): [string, string] => [key, String(value)])
      .sort(([a], [b]) => a.localeCompare(b));

    const dataCheckString: string = entries.map(([k, v]) => `${k}=${v}`).join('\n');
    const secretKey: Buffer = createHash('sha256').update(botToken).digest();
    const hmac: string = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (hmac !== data.hash) {
      throw new UnauthorizedException('Invalid Telegram login hash');
    }
  }

  private verifyAuthDate(authDate: number): void {
    const nowSec: number = Math.floor(Date.now() / 1000);

    if (nowSec - authDate > MAX_AUTH_AGE_SEC) {
      throw new UnauthorizedException('Telegram login data is expired');
    }
  }

  private verifyRefreshToken(token: string): IJwtPayload {
    try {
      const payload: IJwtPayload = this.jwtService.verify<IJwtPayload>(token);

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
