import { Injectable } from '@nestjs/common';

import { BaseRpcProvider } from './base-rpc.provider';
import { AppConfigService } from '../../config/app-config.service';
import type { IFallbackRpcProvider } from '../interfaces/rpc-provider.interface';

@Injectable()
export class InfuraFallbackProvider extends BaseRpcProvider implements IFallbackRpcProvider {
  public constructor(appConfigService: AppConfigService) {
    super(appConfigService.ethInfuraWssUrl, 'infura-fallback');
  }
}
