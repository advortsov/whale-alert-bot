import { Module } from '@nestjs/common';

import { BottleneckRateLimiterService } from './bottleneck-rate-limiter.service';

@Module({
  providers: [BottleneckRateLimiterService],
  exports: [BottleneckRateLimiterService],
})
export class RateLimitingModule {}
