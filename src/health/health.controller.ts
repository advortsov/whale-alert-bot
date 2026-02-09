import { Controller, Get } from '@nestjs/common';

import { HealthService } from './health.service';
import type { AppHealthStatus } from './health.types';

@Controller('health')
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  @Get()
  public async getHealthStatus(): Promise<AppHealthStatus> {
    return this.healthService.getHealthStatus();
  }
}
