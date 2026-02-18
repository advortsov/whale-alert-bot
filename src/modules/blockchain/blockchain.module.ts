import { Module } from '@nestjs/common';

import { AddressCodecRegistry } from './address-codec.registry';
import { ProviderFailoverService } from './factory/provider-failover.service';
import { ProviderFactory } from './factory/provider.factory';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { BottleneckRateLimiterService } from './rate-limiting/bottleneck-rate-limiter.service';
import { DatabaseModule } from '../../database/database.module';
import { RuntimeModule } from '../../runtime/runtime.module';

@Module({
  imports: [DatabaseModule, RuntimeModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    BottleneckRateLimiterService,
    ProviderFailoverService,
    ProviderFactory,
    AddressCodecRegistry,
  ],
  exports: [
    HealthService,
    BottleneckRateLimiterService,
    ProviderFailoverService,
    ProviderFactory,
    AddressCodecRegistry,
  ],
})
export class BlockchainModule {}
