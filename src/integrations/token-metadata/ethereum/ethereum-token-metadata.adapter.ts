import { Injectable } from '@nestjs/common';

import {
  FALLBACK_TOKEN_METADATA,
  KNOWN_TOKEN_METADATA,
} from '../../../alerts/constants/known-token-metadata';
import { AppConfigService } from '../../../config/app-config.service';
import type {
  ITokenMetadataAdapter,
  TokenMetadataDto,
} from '../../../core/ports/token-metadata/token-metadata.interfaces';

interface TokenMetadataCacheEntry {
  readonly tokenMetadata: TokenMetadataDto;
  readonly expiresAtEpochMs: number;
}

@Injectable()
export class EthereumTokenMetadataAdapter implements ITokenMetadataAdapter {
  private readonly metadataCache: Map<string, TokenMetadataCacheEntry> = new Map<
    string,
    TokenMetadataCacheEntry
  >();

  public constructor(private readonly appConfigService: AppConfigService) {}

  public getMetadata(
    contractAddress: string | null,
    nowEpochMs: number = Date.now(),
  ): TokenMetadataDto {
    if (!contractAddress) {
      return {
        address: 'native_eth',
        symbol: 'ETH',
        decimals: 18,
      };
    }

    const normalizedAddress: string = contractAddress.toLowerCase();
    const cachedEntry: TokenMetadataCacheEntry | undefined =
      this.metadataCache.get(normalizedAddress);

    if (cachedEntry && cachedEntry.expiresAtEpochMs >= nowEpochMs) {
      return cachedEntry.tokenMetadata;
    }

    const knownMetadata: TokenMetadataDto | undefined = KNOWN_TOKEN_METADATA.get(normalizedAddress);
    const resolvedMetadata: TokenMetadataDto = knownMetadata ?? {
      ...FALLBACK_TOKEN_METADATA,
      address: normalizedAddress,
    };

    const cacheEntry: TokenMetadataCacheEntry = {
      tokenMetadata: resolvedMetadata,
      expiresAtEpochMs: nowEpochMs + this.appConfigService.tokenMetaCacheTtlSec * 1000,
    };

    this.metadataCache.set(normalizedAddress, cacheEntry);
    return resolvedMetadata;
  }
}
