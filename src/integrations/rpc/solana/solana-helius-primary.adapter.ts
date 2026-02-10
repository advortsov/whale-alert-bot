import { Injectable } from '@nestjs/common';

import { BaseSolanaRpcAdapter } from './base-solana-rpc.adapter';
import { AppConfigService } from '../../../config/app-config.service';
import type { IPrimaryRpcAdapter } from '../../../core/ports/rpc/rpc-adapter.interfaces';

@Injectable()
export class SolanaHeliusPrimaryAdapter extends BaseSolanaRpcAdapter implements IPrimaryRpcAdapter {
  public constructor(appConfigService: AppConfigService) {
    super(
      appConfigService.solanaHeliusHttpUrl,
      appConfigService.solanaHeliusWssUrl,
      'solana-helius-primary',
    );
  }
}
