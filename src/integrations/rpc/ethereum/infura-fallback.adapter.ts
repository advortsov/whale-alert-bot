import { Injectable } from '@nestjs/common';

import { BaseEthereumRpcAdapter } from './base-ethereum-rpc.adapter';
import { AppConfigService } from '../../../config/app-config.service';
import type { IFallbackRpcAdapter } from '../../../core/ports/rpc/rpc-adapter.interfaces';

@Injectable()
export class InfuraFallbackAdapter extends BaseEthereumRpcAdapter implements IFallbackRpcAdapter {
  public constructor(appConfigService: AppConfigService) {
    super(appConfigService.ethInfuraWssUrl, 'infura-fallback');
  }
}
