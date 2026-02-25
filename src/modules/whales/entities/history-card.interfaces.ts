export enum HistoryTxType {
  TRANSFER = 'TRANSFER',
  SWAP = 'SWAP',
  CONTRACT = 'CONTRACT',
}

export enum HistoryFlowType {
  DEX = 'DEX',
  CEX = 'CEX',
  CONTRACT = 'CONTRACT',
  P2P = 'P2P',
  UNKNOWN = 'UNKNOWN',
}

export enum HistoryAssetStandard {
  NATIVE = 'NATIVE',
  ERC20 = 'ERC20',
  SPL = 'SPL',
  TRC20 = 'TRC20',
  TRC10 = 'TRC10',
  UNKNOWN = 'UNKNOWN',
}
