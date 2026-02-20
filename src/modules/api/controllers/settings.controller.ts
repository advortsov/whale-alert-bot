import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { TelegramUserRef } from '../../whales/entities/tracking.interfaces';
import type { IUserSettingsResult } from '../../whales/interfaces/tracking-settings.result';
import { TrackingService } from '../../whales/services/tracking.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { type UpdateSettingsDto, updateSettingsSchema } from '../dto/update-settings.dto';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { UPDATE_SETTINGS_BODY_SCHEMA, USER_SETTINGS_RESULT_SCHEMA } from '../swagger/api-schemas';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('api/settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  public constructor(private readonly trackingService: TrackingService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user settings' })
  @ApiResponse({ status: 200, description: 'User settings', schema: USER_SETTINGS_RESULT_SCHEMA })
  public async getSettings(@CurrentUser() user: TelegramUserRef): Promise<IUserSettingsResult> {
    return this.trackingService.getSettings(user);
  }

  @Patch()
  @ApiOperation({ summary: 'Update user settings' })
  @ApiBody({ schema: UPDATE_SETTINGS_BODY_SCHEMA })
  @ApiResponse({
    status: 200,
    description: 'Updated settings',
    schema: USER_SETTINGS_RESULT_SCHEMA,
  })
  public async updateSettings(
    @CurrentUser() user: TelegramUserRef,
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsDto,
  ): Promise<IUserSettingsResult> {
    return this.trackingService.updateSettings(user, body);
  }
}
