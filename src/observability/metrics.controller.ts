import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';

import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  public constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  public async getMetrics(@Res() response: Response): Promise<void> {
    const metrics: string = await this.metricsService.getMetrics();
    response.set('Content-Type', this.metricsService.getContentType());
    response.end(metrics);
  }
}
