import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { TelegramUserRef } from '../../whales/entities/tracking.interfaces';

// eslint-disable-next-line @typescript-eslint/naming-convention -- NestJS param decorator convention
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TelegramUserRef => {
    const request: Request & { user?: TelegramUserRef } = ctx
      .switchToHttp()
      .getRequest<Request & { user?: TelegramUserRef }>();

    if (!request.user) {
      throw new Error('User not found on request. Ensure JwtAuthGuard is applied.');
    }

    return request.user;
  },
);
