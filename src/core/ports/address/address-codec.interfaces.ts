export interface IAddressValidator {
  validate(rawAddress: string): boolean;
}

export interface IAddressCodec extends IAddressValidator {
  normalize(rawAddress: string): string | null;
  formatShort(address: string): string;
}
