import { Injectable } from '@nestjs/common';

import { FALLBACK_TOKEN_METADATA, KNOWN_TOKEN_METADATA } from './constants/known-token-metadata';
import type { TokenMetadata } from './token-metadata.interfaces';
import { AppConfigService } from '../config/app-config.service';

type TokenMetadataCacheEntry = {
  readonly tokenMetadata: TokenMetadata;
  readonly expiresAtEpochMs: number;
};

@Injectable()
export class TokenMetadataService {
  private readonly metadataCache: Map<string, TokenMetadataCacheEntry> = new Map<
    string,
    TokenMetadataCacheEntry
  >();

  public constructor(private readonly appConfigService: AppConfigService) {}

  public getMetadata(
    contractAddress: string | null,
    nowEpochMs: number = Date.now(),
  ): TokenMetadata {
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

    const knownMetadata: TokenMetadata | undefined = KNOWN_TOKEN_METADATA.get(normalizedAddress);
    const resolvedMetadata: TokenMetadata = knownMetadata ?? {
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
