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

interface ITokenMetadataCacheEntry {
  readonly tokenMetadata: ITokenMetadataDto;
  readonly expiresAtEpochMs: number;
}

@Injectable()
export class EthereumTokenMetadataAdapter implements ITokenMetadataAdapter {
  private readonly metadataCache: Map<string, ITokenMetadataCacheEntry> = new Map<
    string,
    ITokenMetadataCacheEntry
  >();

  public constructor(private readonly appConfigService: AppConfigService) {}

  public getMetadata(
    contractAddress: string | null,
    nowEpochMs: number = Date.now(),
  ): ITokenMetadataDto {
    if (!contractAddress) {
      return {
        address: 'native_eth',
        symbol: 'ETH',
        decimals: 18,
      };
    }

    const normalizedAddress: string = contractAddress.toLowerCase();
    const cachedEntry: ITokenMetadataCacheEntry | undefined =
      this.metadataCache.get(normalizedAddress);

    if (cachedEntry && cachedEntry.expiresAtEpochMs >= nowEpochMs) {
      return cachedEntry.tokenMetadata;
    }

    const knownMetadata: ITokenMetadataDto | undefined =
      KNOWN_TOKEN_METADATA.get(normalizedAddress);
    const resolvedMetadata: ITokenMetadataDto = knownMetadata ?? {
      ...FALLBACK_TOKEN_METADATA,
      address: normalizedAddress,
    };

    const cacheEntry: ITokenMetadataCacheEntry = {
      tokenMetadata: resolvedMetadata,
      expiresAtEpochMs: nowEpochMs + this.appConfigService.tokenMetaCacheTtlSec * 1000,
    };

    this.metadataCache.set(normalizedAddress, cacheEntry);
    return resolvedMetadata;
  }
}
