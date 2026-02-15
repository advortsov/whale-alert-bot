export interface ITokenMetadataDto {
  readonly address: string;
  readonly symbol: string;
  readonly decimals: number;
}

export interface ITokenMetadataAdapter {
  getMetadata(contractAddress: string | null): ITokenMetadataDto;
}
