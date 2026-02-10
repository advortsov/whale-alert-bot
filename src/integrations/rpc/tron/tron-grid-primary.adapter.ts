import { Injectable } from '@nestjs/common';

import { BaseTronRpcAdapter } from './base-tron-rpc.adapter';
import { AppConfigService } from '../../../config/app-config.service';
import type { IPrimaryRpcAdapter } from '../../../core/ports/rpc/rpc-adapter.interfaces';
import { TronAddressCodec } from '../../address/tron/tron-address.codec';

@Injectable()
export class TronGridPrimaryAdapter extends BaseTronRpcAdapter implements IPrimaryRpcAdapter {
  public constructor(appConfigService: AppConfigService, tronAddressCodec: TronAddressCodec) {
    super(
      appConfigService.tronPrimaryHttpUrl,
      'tron-grid-primary',
      appConfigService.tronGridApiKey,
      tronAddressCodec,
      {
        pollIntervalMs: appConfigService.chainTronPollIntervalMs,
        maxBlockCatchupPerPoll: appConfigService.chainTronCatchupBatch,
      },
    );
  }
}
