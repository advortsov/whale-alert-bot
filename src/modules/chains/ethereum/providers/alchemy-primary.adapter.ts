import { Injectable } from '@nestjs/common';

import { BaseEthereumRpcAdapter } from './base-ethereum-rpc.adapter';
import { AppConfigService } from '../../../../config/app-config.service';
import type { IPrimaryRpcAdapter } from '../../../blockchain/base/rpc-adapter.interfaces';

@Injectable()
export class AlchemyPrimaryAdapter extends BaseEthereumRpcAdapter implements IPrimaryRpcAdapter {
  public constructor(appConfigService: AppConfigService) {
    super(appConfigService.ethAlchemyWssUrl, 'alchemy-primary');
  }
}
