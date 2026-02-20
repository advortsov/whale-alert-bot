import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { SettingsController } from './controllers/settings.controller';
import { StatusController } from './controllers/status.controller';
import { WalletsController } from './controllers/wallets.controller';
import { AppConfigService } from '../../config/app-config.service';
import { DatabaseModule } from '../../database/database.module';
import { WhalesModule } from '../whales/whales.module';

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
  ],
  controllers: [AuthController, WalletsController, SettingsController, StatusController],
  providers: [AuthService, JwtAuthGuard],
})
export class ApiModule {}
