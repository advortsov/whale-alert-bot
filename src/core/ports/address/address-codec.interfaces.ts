export interface IAddressValidator {
  validate(rawAddress: string): boolean;
}

export interface IAddressCodec {
  normalize(rawAddress: string): string | null;
  formatShort(address: string): string;
}
