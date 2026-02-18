import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import type { IAddressCodec } from '../../../common/interfaces/address/address-codec.interfaces';

const BASE58_ALPHABET: string = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP: ReadonlyMap<string, number> = new Map(
  BASE58_ALPHABET.split('').map((character: string, index: number): readonly [string, number] => [
    character,
    index,
  ]),
);
const TRON_BASE58_PATTERN: RegExp = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const TRON_HEX_WITH_PREFIX_PATTERN: RegExp = /^41[0-9a-fA-F]{40}$/;
const TRON_HEX_WITHOUT_PREFIX_PATTERN: RegExp = /^[0-9a-fA-F]{40}$/;
const ETHEREUM_STYLE_HEX_PATTERN: RegExp = /^0x[0-9a-fA-F]{40}$/;
const TRON_ADDRESS_PREFIX: number = 0x41;
const SHORT_FORMAT_MIN_LENGTH = 14;
const SHORT_FORMAT_PREFIX_LENGTH = 7;
const SHORT_FORMAT_SUFFIX_OFFSET = -6;
const BASE58_CHECK_FULL_LENGTH = 25;
const BASE58_CHECK_PAYLOAD_END = 21;
const BASE58_CHECK_CHECKSUM_END = 25;
const PAYLOAD_BYTE_LENGTH = 21;
const CHECKSUM_BYTE_LENGTH = 4;
const BASE58_RADIX = 58n;
const BASE256_RADIX = 256n;
const BIGINT_ZERO = 0n;
const BYTE_MASK = 0xffn;
const BYTE_SHIFT = 8n;

@Injectable()
export class TronAddressCodec implements IAddressCodec {
  public validate(rawAddress: string): boolean {
    return this.normalize(rawAddress) !== null;
  }

  public normalize(rawAddress: string): string | null {
    const normalizedAddress: string = rawAddress.trim();

    if (normalizedAddress.length === 0) {
      return null;
    }

    if (TRON_BASE58_PATTERN.test(normalizedAddress)) {
      return this.validateBase58Address(normalizedAddress) ? normalizedAddress : null;
    }

    const payload: Buffer | null = this.parseHexToPayload(normalizedAddress);

    if (payload === null) {
      return null;
    }

    return this.encodeBase58Check(payload);
  }

  public formatShort(address: string): string {
    const normalizedAddress: string = address.trim();

    if (normalizedAddress.length <= SHORT_FORMAT_MIN_LENGTH) {
      return normalizedAddress;
    }

    return `${normalizedAddress.slice(0, SHORT_FORMAT_PREFIX_LENGTH)}...${normalizedAddress.slice(SHORT_FORMAT_SUFFIX_OFFSET)}`;
  }

  private validateBase58Address(rawAddress: string): boolean {
    const decodedBytes: Buffer | null = this.decodeBase58(rawAddress);

    if (decodedBytes?.length !== BASE58_CHECK_FULL_LENGTH) {
      return false;
    }

    const payload: Buffer = decodedBytes.subarray(0, BASE58_CHECK_PAYLOAD_END);
    const checksum: Buffer = decodedBytes.subarray(
      BASE58_CHECK_PAYLOAD_END,
      BASE58_CHECK_CHECKSUM_END,
    );

    if (payload[0] !== TRON_ADDRESS_PREFIX) {
      return false;
    }

    const expectedChecksum: Buffer = this.computeChecksum(payload);
    return checksum.equals(expectedChecksum);
  }

  private parseHexToPayload(rawAddress: string): Buffer | null {
    let normalizedHex: string = rawAddress;

    if (ETHEREUM_STYLE_HEX_PATTERN.test(rawAddress)) {
      normalizedHex = rawAddress.slice(2);
    }

    if (TRON_HEX_WITHOUT_PREFIX_PATTERN.test(normalizedHex)) {
      normalizedHex = `41${normalizedHex}`;
    }

    if (!TRON_HEX_WITH_PREFIX_PATTERN.test(normalizedHex)) {
      return null;
    }

    const payload: Buffer = Buffer.from(normalizedHex, 'hex');
    return payload.length === PAYLOAD_BYTE_LENGTH ? payload : null;
  }

  private encodeBase58Check(payload: Buffer): string {
    const checksum: Buffer = this.computeChecksum(payload);
    const fullBytes: Buffer = Buffer.concat([payload, checksum]);

    return this.encodeBase58(fullBytes);
  }

  private computeChecksum(payload: Buffer): Buffer {
    const hashOnce: Buffer = createHash('sha256').update(payload).digest();
    const hashTwice: Buffer = createHash('sha256').update(hashOnce).digest();

    return hashTwice.subarray(0, CHECKSUM_BYTE_LENGTH);
  }

  private decodeBase58(value: string): Buffer | null {
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
    return Buffer.from(resultBytes);
  }

  private encodeBase58(bytes: Buffer): string {
    if (bytes.length === 0) {
      return '';
    }

    let leadingZeroes: number = 0;

    while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) {
      leadingZeroes += 1;
    }

    let numericValue: bigint = BIGINT_ZERO;

    for (const byteValue of bytes) {
      numericValue = numericValue * BASE256_RADIX + BigInt(byteValue);
    }

    let encoded: string = '';

    while (numericValue > BIGINT_ZERO) {
      const remainder: number = Number(numericValue % BASE58_RADIX);
      encoded = `${BASE58_ALPHABET[remainder]}${encoded}`;
      numericValue /= BASE58_RADIX;
    }

    if (leadingZeroes > 0) {
      encoded = `${'1'.repeat(leadingZeroes)}${encoded}`;
    }

    return encoded;
  }
}
