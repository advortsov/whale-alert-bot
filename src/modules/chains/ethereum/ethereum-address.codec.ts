import { Injectable } from '@nestjs/common';
import { getAddress } from 'ethers';

import type { IAddressCodec } from '../../../common/interfaces/address/address-codec.interfaces';

const ETHEREUM_ADDRESS_PATTERN: RegExp = /^0x[a-fA-F0-9]{40}$/;
const SHORT_FORMAT_MIN_LENGTH = 14;
const SHORT_FORMAT_PREFIX_LENGTH = 8;
const SHORT_FORMAT_SUFFIX_OFFSET = -6;

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

    if (normalizedAddress.length <= SHORT_FORMAT_MIN_LENGTH) {
      return normalizedAddress;
    }

    return `${normalizedAddress.slice(0, SHORT_FORMAT_PREFIX_LENGTH)}...${normalizedAddress.slice(SHORT_FORMAT_SUFFIX_OFFSET)}`;
  }
}
