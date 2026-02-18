import { Injectable } from '@nestjs/common';

import type { IAddressCodec } from '../../../common/interfaces/address/address-codec.interfaces';

const BASE58_ALPHABET: string = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const SOL_ADDR_MIN_LENGTH = 32;
const SOL_ADDR_MAX_LENGTH = 44;
const SOL_DECODED_BYTE_LENGTH = 32;
const SHORT_FORMAT_MIN_LENGTH = 12;
const SHORT_FORMAT_PREFIX_LENGTH = 6;
const SHORT_FORMAT_SUFFIX_OFFSET = -6;
const BASE58_RADIX = 58n;
const BIGINT_ZERO = 0n;
const BYTE_MASK = 0xffn;
const BYTE_SHIFT = 8n;

const BASE58_MAP: ReadonlyMap<string, number> = new Map(
  BASE58_ALPHABET.split('').map((character: string, index: number): readonly [string, number] => [
    character,
    index,
  ]),
);

@Injectable()
export class SolanaAddressCodec implements IAddressCodec {
  public validate(rawAddress: string): boolean {
    const normalizedAddress: string = rawAddress.trim();

    if (
      normalizedAddress.length < SOL_ADDR_MIN_LENGTH ||
      normalizedAddress.length > SOL_ADDR_MAX_LENGTH
    ) {
      return false;
    }

    const decodedBytes: Uint8Array | null = this.decodeBase58(normalizedAddress);
    return decodedBytes !== null && decodedBytes.length === SOL_DECODED_BYTE_LENGTH;
  }

  public normalize(rawAddress: string): string | null {
    const normalizedAddress: string = rawAddress.trim();

    if (!this.validate(normalizedAddress)) {
      return null;
    }

    return normalizedAddress;
  }

  public formatShort(address: string): string {
    const normalizedAddress: string = address.trim();

    if (normalizedAddress.length <= SHORT_FORMAT_MIN_LENGTH) {
      return normalizedAddress;
    }

    return `${normalizedAddress.slice(0, SHORT_FORMAT_PREFIX_LENGTH)}...${normalizedAddress.slice(SHORT_FORMAT_SUFFIX_OFFSET)}`;
  }

  private decodeBase58(value: string): Uint8Array | null {
    if (value.length === 0) {
      return null;
    }

    let numericValue: bigint = BIGINT_ZERO;

    for (const character of value) {
      const charValue: number | undefined = BASE58_MAP.get(character);

      if (typeof charValue === 'undefined') {
        return null;
      }

      numericValue = numericValue * BASE58_RADIX + BigInt(charValue);
    }

    let leadingZeroes: number = 0;
    while (leadingZeroes < value.length && value[leadingZeroes] === '1') {
      leadingZeroes += 1;
    }

    const decodedBytes: number[] = [];
    while (numericValue > BIGINT_ZERO) {
      const byteValue: number = Number(numericValue & BYTE_MASK);
      decodedBytes.push(byteValue);
      numericValue >>= BYTE_SHIFT;
    }

    decodedBytes.reverse();

    const resultBytes: number[] = new Array<number>(leadingZeroes).fill(0).concat(decodedBytes);
    return Uint8Array.from(resultBytes);
  }
}
