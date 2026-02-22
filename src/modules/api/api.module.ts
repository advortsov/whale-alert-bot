import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { SettingsController } from './controllers/settings.controller';
import { StatusController } from './controllers/status.controller';
import { WalletsController } from './controllers/wallets.controller';
import { TmaModule } from './tma/tma.module';
import { AppConfigService } from '../../config/app-config.service';
import { DatabaseModule } from '../../database/database.module';
import { WhalesModule } from '../whales/whales.module';

const isTmaEnabled = (): boolean => {
  const rawValue: string = process.env['TMA_ENABLED'] ?? 'false';
  const normalizedValue: string = rawValue.trim().toLowerCase();

  return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes';
};

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (config: AppConfigService) => ({
        secret: config.jwtSecret ?? 'dev-secret-do-not-use-in-prod',
        signOptions: { expiresIn: config.jwtAccessTtlSec },
      }),
      inject: [AppConfigService],
    }),
    DatabaseModule,
    WhalesModule,
    TmaModule.register(isTmaEnabled()),
  ],
  controllers: [AuthController, WalletsController, SettingsController, StatusController],
  providers: [AuthService, JwtAuthGuard],
})
export class ApiModule {}
