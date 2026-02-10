export interface TronGridListLinks {
  readonly next?: string | undefined;
}

export interface TronGridListMeta {
  readonly fingerprint?: string | undefined;
  readonly links?: TronGridListLinks | undefined;
}

export interface TronGridListResponse<TItem> {
  readonly success?: boolean | undefined;
  readonly data?: readonly TItem[] | undefined;
  readonly meta?: TronGridListMeta | undefined;
}

export interface TronGridNativeRetItem {
  readonly contractRet?: string | undefined;
}

export interface TronGridNativeContractValue {
  readonly owner_address?: string | undefined;
  readonly to_address?: string | undefined;
  readonly contract_address?: string | undefined;
  readonly amount?: number | string | undefined;
  readonly call_value?: number | string | undefined;
}

export interface TronGridNativeContractParameter {
  readonly value?: TronGridNativeContractValue | undefined;
}

export interface TronGridNativeContractItem {
  readonly type?: string | undefined;
  readonly parameter?: TronGridNativeContractParameter | undefined;
}

export interface TronGridNativeRawData {
  readonly contract?: readonly TronGridNativeContractItem[] | undefined;
}

export interface TronGridNativeTransactionItem {
  readonly txID?: string | undefined;
  readonly block_timestamp?: number | undefined;
  readonly raw_data?: TronGridNativeRawData | undefined;
  readonly ret?: readonly TronGridNativeRetItem[] | undefined;
}

export interface TronGridTrc20TokenInfo {
  readonly symbol?: string | undefined;
  readonly decimals?: number | string | undefined;
}

export interface TronGridTrc20TransactionItem {
  readonly transaction_id?: string | undefined;
  readonly block_timestamp?: number | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly value?: string | number | undefined;
  readonly token_info?: TronGridTrc20TokenInfo | undefined;
}
