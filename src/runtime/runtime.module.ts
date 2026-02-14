import { Module } from '@nestjs/common';

import { RuntimeStatusService } from './runtime-status.service';
import { ObservabilityModule } from '../observability/observability.module';

@Module({
  imports: [ObservabilityModule],
  providers: [RuntimeStatusService],
  exports: [RuntimeStatusService],
})
export class RuntimeModule {}
