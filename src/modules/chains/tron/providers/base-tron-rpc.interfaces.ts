import type { TronAddressCodec } from '../tron-address.codec';

export interface ITronRpcAdapterOptions {
  readonly httpUrl: string | null;
  readonly providerName: string;
  readonly tronApiKey: string | null;
  readonly tronAddressCodec: TronAddressCodec;
  readonly streamOptions?: Partial<ITronStreamOptions>;
}

export interface ITronStreamOptions {
  readonly pollIntervalMs: number;
  readonly maxBlockCatchupPerPoll: number;
  readonly pollJitterMs: number;
}

export type TronBlockHeader = {
  readonly raw_data?: {
    readonly number?: number;
    readonly timestamp?: number;
  };
};

export type TronContractValue = {
  readonly owner_address?: string;
  readonly to_address?: string;
};

export type TronContract = {
  readonly parameter?: {
    readonly value?: TronContractValue;
  };
};

export type TronTransaction = {
  readonly txID?: string;
  readonly raw_data?: {
    readonly contract?: readonly TronContract[];
  };
};

export type TronGetNowBlockResponse = {
  readonly block_header?: TronBlockHeader;
};

export type TronGetBlockByNumResponse = {
  readonly block_header?: TronBlockHeader;
  readonly transactions?: readonly TronTransaction[];
};

export type TronTransactionInfoLog = {
  readonly address?: string;
  readonly topics?: readonly string[];
  readonly data?: string;
};

export type TronGetTransactionInfoResponse = {
  readonly id?: string;
  readonly log?: readonly TronTransactionInfoLog[];
};

export type TronTransactionByIdContractValue = {
  readonly amount?: number | string;
  readonly asset_name?: string;
  readonly asset_id?: string;
};

export type TronTransactionByIdContract = {
  readonly type?: string;
  readonly parameter?: {
    readonly value?: TronTransactionByIdContractValue;
  };
};

export type TronGetTransactionByIdResponse = {
  readonly raw_data?: {
    readonly contract?: readonly TronTransactionByIdContract[];
  };
};
