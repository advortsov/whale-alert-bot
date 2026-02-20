import { Body, Controller, HttpCode, HttpStatus, Post, UsePipes } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { IAuthTokens } from './auth.interfaces';
import { AuthService } from './auth.service';
import { type RefreshTokenDto, refreshTokenSchema } from '../dto/refresh-token.dto';
import { type TelegramLoginDto, telegramLoginSchema } from '../dto/telegram-login.dto';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import {
  AUTH_TOKENS_SCHEMA,
  REFRESH_TOKEN_BODY_SCHEMA,
  TELEGRAM_LOGIN_BODY_SCHEMA,
} from '../swagger/api-schemas';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  public constructor(private readonly authService: AuthService) {}

  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login via Telegram widget data' })
  @ApiBody({ schema: TELEGRAM_LOGIN_BODY_SCHEMA })
  @ApiResponse({ status: 200, description: 'JWT token pair', schema: AUTH_TOKENS_SCHEMA })
  @ApiResponse({ status: 401, description: 'Invalid Telegram auth data' })
  @UsePipes(new ZodValidationPipe(telegramLoginSchema))
  public async loginWithTelegram(@Body() body: TelegramLoginDto): Promise<IAuthTokens> {
    return this.authService.loginWithTelegram(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh JWT tokens' })
  @ApiBody({ schema: REFRESH_TOKEN_BODY_SCHEMA })
  @ApiResponse({ status: 200, description: 'New JWT token pair', schema: AUTH_TOKENS_SCHEMA })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @UsePipes(new ZodValidationPipe(refreshTokenSchema))
  public async refreshTokens(@Body() body: RefreshTokenDto): Promise<IAuthTokens> {
    return this.authService.refreshTokens(body.refreshToken);
  }
}
