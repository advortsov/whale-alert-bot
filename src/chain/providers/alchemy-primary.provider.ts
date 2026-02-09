import { Injectable } from '@nestjs/common';

import { BaseRpcProvider } from './base-rpc.provider';
import { AppConfigService } from '../../config/app-config.service';
import type { IPrimaryRpcProvider } from '../interfaces/rpc-provider.interface';

@Injectable()
export class AlchemyPrimaryProvider extends BaseRpcProvider implements IPrimaryRpcProvider {
  public constructor(appConfigService: AppConfigService) {
    super(appConfigService.ethAlchemyWssUrl, 'alchemy-primary');
  }
}
