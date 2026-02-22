import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { ITmaInitResult } from './tma-init.interfaces';
import { TmaInitService } from './tma-init.service';
import type { TelegramUserRef } from '../../whales/entities/tracking.interfaces';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TMA_INIT_RESULT_SCHEMA } from '../swagger/api-schemas';

@ApiTags('TMA')
@ApiBearerAuth()
@Controller('api/tma')
@UseGuards(JwtAuthGuard)
export class TmaInitController {
  public constructor(private readonly tmaInitService: TmaInitService) {}

  @Get('init')
  @ApiOperation({ summary: 'Load initial data for Telegram Mini App' })
  @ApiResponse({ status: 200, description: 'TMA init payload', schema: TMA_INIT_RESULT_SCHEMA })
  public async getInitData(@CurrentUser() userRef: TelegramUserRef): Promise<ITmaInitResult> {
    return this.tmaInitService.loadInitData(userRef);
  }
}
