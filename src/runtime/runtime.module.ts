import { Module } from '@nestjs/common';

import { RuntimeStatusService } from './runtime-status.service';

@Module({
  providers: [RuntimeStatusService],
  exports: [RuntimeStatusService],
})
export class RuntimeModule {}
