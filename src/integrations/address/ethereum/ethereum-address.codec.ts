import { Injectable } from '@nestjs/common';
import { getAddress } from 'ethers';

import type { IAddressCodec } from '../../../core/ports/address/address-codec.interfaces';

const ETHEREUM_ADDRESS_PATTERN: RegExp = /^0x[a-fA-F0-9]{40}$/;

@Injectable()
export class EthereumAddressCodec implements IAddressCodec {
  public validate(rawAddress: string): boolean {
    return ETHEREUM_ADDRESS_PATTERN.test(rawAddress.trim());
  }

  public normalize(rawAddress: string): string | null {
    try {
      return getAddress(rawAddress.trim());
    } catch {
      return null;
    }
  }

  public formatShort(address: string): string {
    const normalizedAddress: string = address.trim();

    if (normalizedAddress.length <= 14) {
      return normalizedAddress;
    }

    return `${normalizedAddress.slice(0, 8)}...${normalizedAddress.slice(-6)}`;
  }
}
