import { Injectable } from '@nestjs/common';

import { BaseSolanaRpcAdapter } from './base-solana-rpc.adapter';
import { AppConfigService } from '../../../config/app-config.service';
import type { IFallbackRpcAdapter } from '../../../core/ports/rpc/rpc-adapter.interfaces';

@Injectable()
export class SolanaPublicFallbackAdapter
  extends BaseSolanaRpcAdapter
  implements IFallbackRpcAdapter
{
  public constructor(appConfigService: AppConfigService) {
    super(
      appConfigService.solanaPublicHttpUrl,
      appConfigService.solanaPublicWssUrl,
      'solana-public-fallback',
      {
        pollIntervalMs: appConfigService.chainSolanaPollIntervalMs,
        maxSlotCatchupPerPoll: appConfigService.chainSolanaCatchupBatch,
      },
    );
  }
}
