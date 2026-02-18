export interface ITronGridListLinks {
  readonly next?: string | undefined;
}

export interface ITronGridListMeta {
  readonly fingerprint?: string | undefined;
  readonly links?: ITronGridListLinks | undefined;
}

export interface ITronGridListResponse<TItem> {
  readonly success?: boolean | undefined;
  readonly data?: readonly TItem[] | undefined;
  readonly meta?: ITronGridListMeta | undefined;
}

export interface ITronGridNativeRetItem {
  readonly contractRet?: string | undefined;
}

export interface ITronGridNativeContractValue {
  readonly owner_address?: string | undefined;
  readonly to_address?: string | undefined;
  readonly contract_address?: string | undefined;
  readonly amount?: number | string | undefined;
  readonly call_value?: number | string | undefined;
}

export interface ITronGridNativeContractParameter {
  readonly value?: ITronGridNativeContractValue | undefined;
}

export interface ITronGridNativeContractItem {
  readonly type?: string | undefined;
  readonly parameter?: ITronGridNativeContractParameter | undefined;
}

export interface ITronGridNativeRawData {
  readonly contract?: readonly ITronGridNativeContractItem[] | undefined;
}

export interface ITronGridNativeTransactionItem {
  readonly txID?: string | undefined;
  readonly block_timestamp?: number | undefined;
  readonly raw_data?: ITronGridNativeRawData | undefined;
  readonly ret?: readonly ITronGridNativeRetItem[] | undefined;
}

export interface ITronGridTrc20TokenInfo {
  readonly symbol?: string | undefined;
  readonly decimals?: number | string | undefined;
}

export interface ITronGridTrc20TransactionItem {
  readonly transaction_id?: string | undefined;
  readonly block_timestamp?: number | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly value?: string | number | undefined;
  readonly token_info?: ITronGridTrc20TokenInfo | undefined;
}
