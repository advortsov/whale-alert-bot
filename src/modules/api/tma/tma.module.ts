import { DynamicModule, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { TmaAuthController } from './tma-auth.controller';
import { TmaAuthService } from './tma-auth.service';
import { TmaInitController } from './tma-init.controller';
import { TmaInitService } from './tma-init.service';
import { AppConfigService } from '../../../config/app-config.service';
import { DatabaseModule } from '../../../database/database.module';
import { WhalesModule } from '../../whales/whales.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({})
export class TmaModule {
  public static register(tmaEnabled: boolean): DynamicModule {
    if (!tmaEnabled) {
      return {
        module: TmaModule,
      };
    }

    return {
      module: TmaModule,
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
      controllers: [TmaAuthController, TmaInitController],
      providers: [TmaAuthService, TmaInitService, JwtAuthGuard],
    };
  }
}
