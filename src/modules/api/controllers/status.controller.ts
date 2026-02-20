import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { TelegramUserRef } from '../../whales/entities/tracking.interfaces';
import type { IUserStatusResult } from '../../whales/interfaces/tracking-settings.result';
import { TrackingService } from '../../whales/services/tracking.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { USER_STATUS_RESULT_SCHEMA } from '../swagger/api-schemas';

@ApiTags('Status')
@ApiBearerAuth()
@Controller('api/status')
@UseGuards(JwtAuthGuard)
export class StatusController {
  public constructor(private readonly trackingService: TrackingService) {}

  @Get()
  @ApiOperation({ summary: 'Get user status with quota info' })
  @ApiResponse({ status: 200, description: 'User status', schema: USER_STATUS_RESULT_SCHEMA })
  public async getStatus(@CurrentUser() user: TelegramUserRef): Promise<IUserStatusResult> {
    return this.trackingService.getStatusStructured(user);
  }
}
