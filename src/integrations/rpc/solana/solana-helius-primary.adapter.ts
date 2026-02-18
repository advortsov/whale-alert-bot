import { Injectable } from '@nestjs/common';

import { BaseSolanaRpcAdapter } from './base-solana-rpc.adapter';
import { AppConfigService } from '../../../config/app-config.service';
import type { IPrimaryRpcAdapter } from '../../../modules/blockchain/base/rpc-adapter.interfaces';

@Injectable()
export class SolanaHeliusPrimaryAdapter extends BaseSolanaRpcAdapter implements IPrimaryRpcAdapter {
  public constructor(appConfigService: AppConfigService) {
    super(
      appConfigService.solanaHeliusHttpUrl,
      appConfigService.solanaHeliusWssUrl,
      'solana-helius-primary',
      {
        pollIntervalMs: appConfigService.chainSolanaPollIntervalMs,
        maxSlotCatchupPerPoll: appConfigService.chainSolanaCatchupBatch,
      },
    );
  }
}
