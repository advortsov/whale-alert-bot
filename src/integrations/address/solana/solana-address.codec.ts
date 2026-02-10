import { Injectable } from '@nestjs/common';

import type { IAddressCodec } from '../../../core/ports/address/address-codec.interfaces';

const BASE58_ALPHABET: string = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
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

    if (normalizedAddress.length < 32 || normalizedAddress.length > 44) {
      return false;
    }

    const decodedBytes: Uint8Array | null = this.decodeBase58(normalizedAddress);
    return decodedBytes !== null && decodedBytes.length === 32;
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

    if (normalizedAddress.length <= 12) {
      return normalizedAddress;
    }

    return `${normalizedAddress.slice(0, 6)}...${normalizedAddress.slice(-6)}`;
  }

  private decodeBase58(value: string): Uint8Array | null {
    if (value.length === 0) {
      return null;
    }

    let numericValue: bigint = 0n;

    for (const character of value) {
      const charValue: number | undefined = BASE58_MAP.get(character);

      if (typeof charValue === 'undefined') {
        return null;
      }

      numericValue = numericValue * 58n + BigInt(charValue);
    }

    let leadingZeroes: number = 0;
    while (leadingZeroes < value.length && value[leadingZeroes] === '1') {
      leadingZeroes += 1;
    }

    const decodedBytes: number[] = [];
    while (numericValue > 0n) {
      const byteValue: number = Number(numericValue & 0xffn);
      decodedBytes.push(byteValue);
      numericValue >>= 8n;
    }

    decodedBytes.reverse();

    const resultBytes: number[] = new Array<number>(leadingZeroes).fill(0).concat(decodedBytes);
    return Uint8Array.from(resultBytes);
  }
}
