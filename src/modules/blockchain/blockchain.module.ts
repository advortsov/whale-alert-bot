import { Module } from '@nestjs/common';

import { BottleneckRateLimiterService } from './rate-limiting/bottleneck-rate-limiter.service';

@Module({
  providers: [BottleneckRateLimiterService],
  exports: [BottleneckRateLimiterService],
})
export class BlockchainModule {}
