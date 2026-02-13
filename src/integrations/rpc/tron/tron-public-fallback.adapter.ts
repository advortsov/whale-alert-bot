import { Injectable } from '@nestjs/common';

import { BaseTronRpcAdapter } from './base-tron-rpc.adapter';
import { AppConfigService } from '../../../config/app-config.service';
import type { IFallbackRpcAdapter } from '../../../core/ports/rpc/rpc-adapter.interfaces';
import { TronAddressCodec } from '../../address/tron/tron-address.codec';

@Injectable()
export class TronPublicFallbackAdapter extends BaseTronRpcAdapter implements IFallbackRpcAdapter {
  public constructor(appConfigService: AppConfigService, tronAddressCodec: TronAddressCodec) {
    super({
      httpUrl: appConfigService.tronFallbackHttpUrl,
      providerName: 'tron-public-fallback',
      tronApiKey: appConfigService.tronGridApiKey,
      tronAddressCodec,
      streamOptions: {
        pollIntervalMs: appConfigService.chainTronPollIntervalMs,
        maxBlockCatchupPerPoll: appConfigService.chainTronCatchupBatch,
      },
    });
  }
}
