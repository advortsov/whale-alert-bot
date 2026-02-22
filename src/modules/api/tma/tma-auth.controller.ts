import { Body, Controller, HttpCode, HttpStatus, Post, UsePipes } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { TmaAuthService } from './tma-auth.service';
import type { IAuthTokens } from '../auth/auth.interfaces';
import { type TmaInitDataDto, tmaInitDataSchema } from '../dto/tma-init-data.dto';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { AUTH_TOKENS_SCHEMA, TMA_LOGIN_BODY_SCHEMA } from '../swagger/api-schemas';

@ApiTags('Auth')
@Controller('api/auth')
export class TmaAuthController {
  public constructor(private readonly tmaAuthService: TmaAuthService) {}

  @Post('tma')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login via Telegram Mini App initData' })
  @ApiBody({ schema: TMA_LOGIN_BODY_SCHEMA })
  @ApiResponse({ status: 200, description: 'JWT token pair', schema: AUTH_TOKENS_SCHEMA })
  @ApiResponse({ status: 401, description: 'Invalid or expired Telegram TMA initData' })
  @UsePipes(new ZodValidationPipe(tmaInitDataSchema))
  public async loginWithTmaInitData(@Body() body: TmaInitDataDto): Promise<IAuthTokens> {
    return this.tmaAuthService.loginWithInitData(body.initData);
  }
}
