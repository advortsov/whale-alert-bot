import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import type { IJwtPayload } from './auth.interfaces';
import type { TelegramUserRef } from '../../whales/entities/tracking.interfaces';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  public constructor(private readonly jwtService: JwtService) {}

  public canActivate(context: ExecutionContext): boolean {
    const request: Request = context.switchToHttp().getRequest<Request>();
    const token: string | null = this.extractToken(request);

    if (token === null) {
      throw new UnauthorizedException('Missing authorization token');
    }

    try {
      const payload: IJwtPayload = this.jwtService.verify<IJwtPayload>(token);

      if (payload.type !== 'access') {
        throw new UnauthorizedException('Invalid token type');
      }

      const userRef: TelegramUserRef = {
        telegramId: payload.sub,
        username: payload.username,
      };
      (request as Request & { user: TelegramUserRef }).user = userRef;

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(request: Request): string | null {
    const authHeader: string | undefined = request.headers.authorization;

    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const BEARER_PREFIX_LENGTH = 7;
    return authHeader.slice(BEARER_PREFIX_LENGTH);
  }
}
