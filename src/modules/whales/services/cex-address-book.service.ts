import { Injectable } from '@nestjs/common';

import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import { AppConfigService } from '../../../config/app-config.service';
import { KNOWN_CEX_ADDRESS_BOOK } from '../entities/known-cex-addresses';

@Injectable()
export class CexAddressBookService {
  private readonly addressToTagMap: Map<string, string>;

  public constructor(private readonly appConfigService: AppConfigService) {
    this.addressToTagMap = new Map<string, string>();
    this.seedKnownAddresses();
    this.seedCustomAddresses();
  }

  public resolveTag(chainKey: ChainKey, rawAddress: string | null): string | null {
    const normalizedAddress: string | null = this.normalizeAddress(rawAddress);

    if (normalizedAddress === null) {
      return null;
    }

    const mapKey: string = this.toMapKey(chainKey, normalizedAddress);
    return this.addressToTagMap.get(mapKey) ?? null;
  }

  private seedKnownAddresses(): void {
    for (const entry of KNOWN_CEX_ADDRESS_BOOK) {
      const normalizedAddress: string | null = this.normalizeAddress(entry.address);

      if (normalizedAddress === null) {
        continue;
      }

      const mapKey: string = this.toMapKey(entry.chainKey, normalizedAddress);
      this.addressToTagMap.set(mapKey, entry.tag);
    }
  }

  private seedCustomAddresses(): void {
    for (const rawAddress of this.appConfigService.ethCexAddressAllowlist) {
      const normalizedAddress: string | null = this.normalizeAddress(rawAddress);

      if (normalizedAddress === null) {
        continue;
      }

      const mapKey: string = this.toMapKey(ChainKey.ETHEREUM_MAINNET, normalizedAddress);

      if (!this.addressToTagMap.has(mapKey)) {
        this.addressToTagMap.set(mapKey, 'custom_cex');
      }
    }
  }

  private normalizeAddress(rawAddress: string | null): string | null {
    if (rawAddress === null) {
      return null;
    }

    const normalizedValue: string = rawAddress.trim().toLowerCase();

    if (!/^0x[a-f0-9]{40}$/.test(normalizedValue)) {
      return null;
    }

    return normalizedValue;
  }

  private toMapKey(chainKey: ChainKey, normalizedAddress: string): string {
    return `${chainKey}:${normalizedAddress}`;
  }
}
