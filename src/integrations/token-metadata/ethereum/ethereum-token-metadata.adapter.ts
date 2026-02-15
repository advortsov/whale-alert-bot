import { Injectable } from '@nestjs/common';

import {
  FALLBACK_TOKEN_METADATA,
  KNOWN_TOKEN_METADATA,
} from '../../../alerts/constants/known-token-metadata';
import { AppConfigService } from '../../../config/app-config.service';
import type {
  ITokenMetadataAdapter,
  ITokenMetadataDto,
} from '../../../core/ports/token-metadata/token-metadata.interfaces';
import { SimpleCacheImpl } from '../../../infra/cache';

@Injectable()
export class EthereumTokenMetadataAdapter implements ITokenMetadataAdapter {
  private readonly metadataCache: SimpleCacheImpl<ITokenMetadataDto>;

  public constructor(private readonly appConfigService: AppConfigService) {
    this.metadataCache = new SimpleCacheImpl<ITokenMetadataDto>({
      ttlSec: this.appConfigService.tokenMetaCacheTtlSec,
    });
  }

  public getMetadata(contractAddress: string | null): ITokenMetadataDto {
    if (!contractAddress) {
      return {
        address: 'native_eth',
        symbol: 'ETH',
        decimals: 18,
      };
    }

    const normalizedAddress: string = contractAddress.toLowerCase();
    const cached: ITokenMetadataDto | undefined = this.metadataCache.get(normalizedAddress);

    if (cached) {
      return cached;
    }

    const knownMetadata: ITokenMetadataDto | undefined =
      KNOWN_TOKEN_METADATA.get(normalizedAddress);
    const resolvedMetadata: ITokenMetadataDto = knownMetadata ?? {
      ...FALLBACK_TOKEN_METADATA,
      address: normalizedAddress,
    };

    this.metadataCache.set(normalizedAddress, resolvedMetadata);
    return resolvedMetadata;
  }
}
