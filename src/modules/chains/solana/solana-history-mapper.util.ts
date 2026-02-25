import { SOL_NATIVE_DECIMALS, SPL_TOKEN_DECIMALS } from './solana-rpc-history.constants';
import type {
  ISolanaSignatureInfo,
  ISolanaTokenBalance,
  ISolanaTransactionValue,
} from './solana-rpc-history.interfaces';
import { HistoryDirection, type IHistoryItemDto } from '../../whales/entities/history-item.dto';
import { HistoryDirectionFilter, HistoryKind } from '../../whales/entities/history-request.dto';

const SPL_TOKEN_PROGRAM_SUBSTRING = 'tokenkeg';

export interface ISolanaTransferDetails {
  readonly assetDecimals: number;
  readonly assetSymbol: string;
  readonly direction: HistoryDirection;
  readonly valueRaw: string;
}

export const parseSolanaTransactionValue = (payload: unknown): ISolanaTransactionValue => {
  if (typeof payload !== 'object') {
    throw new Error('Solana getTransaction returned invalid payload.');
  }

  return payload as ISolanaTransactionValue;
};

export const parseSolanaSignatureInfo = (value: unknown): ISolanaSignatureInfo => {
  if (!value || typeof value !== 'object') {
    throw new Error('Solana signature info item is invalid.');
  }

  const item = value as {
    readonly blockTime?: unknown;
    readonly err?: unknown;
    readonly signature?: unknown;
  };

  if (typeof item.signature !== 'string' || item.signature.trim().length === 0) {
    throw new Error('Solana signature info does not contain signature.');
  }

  const blockTime: number | null = typeof item.blockTime === 'number' ? item.blockTime : null;

  return {
    signature: item.signature,
    blockTime,
    err: item.err ?? null,
  };
};

export const resolveSolanaLamportsDelta = (
  accountKeys: readonly string[],
  value: ISolanaTransactionValue,
  address: string,
): number => {
  const normalizedAddress: string = address.trim();
  const addressIndex: number = accountKeys.findIndex(
    (accountKey: string): boolean => accountKey === normalizedAddress,
  );

  if (addressIndex < 0) {
    return 0;
  }

  const preBalance: number = value.meta?.preBalances?.[addressIndex] ?? 0;
  const postBalance: number = value.meta?.postBalances?.[addressIndex] ?? 0;
  return postBalance - preBalance;
};

export const resolveSolanaDirectionByLamportsDelta = (deltaLamports: number): HistoryDirection => {
  if (deltaLamports === 0) {
    return HistoryDirection.UNKNOWN;
  }

  return deltaLamports >= 0 ? HistoryDirection.IN : HistoryDirection.OUT;
};

export const resolveSolanaErrorFlag = (
  value: ISolanaTransactionValue,
  signatureInfo: ISolanaSignatureInfo,
): boolean => {
  const metaError: unknown = value.meta?.err;
  const hasMetaError: boolean = metaError !== undefined && metaError !== null;
  const hasSignatureError: boolean = signatureInfo.err !== null && signatureInfo.err !== undefined;

  return hasMetaError || hasSignatureError;
};

export const detectSolanaSplTransfer = (value: ISolanaTransactionValue): boolean => {
  const logMessages: readonly string[] = value.meta?.logMessages ?? [];

  return logMessages.some((message: string): boolean =>
    message.toLowerCase().includes(SPL_TOKEN_PROGRAM_SUBSTRING),
  );
};

const parseTokenAmountRaw = (tokenBalance: ISolanaTokenBalance | null): bigint | null => {
  if (tokenBalance === null) {
    return null;
  }

  const amountRaw: string | undefined = tokenBalance.uiTokenAmount?.amount;

  if (typeof amountRaw !== 'string') {
    return null;
  }

  try {
    return BigInt(amountRaw);
  } catch {
    return null;
  }
};

const selectTokenBalanceByOwner = (
  balances: readonly ISolanaTokenBalance[] | undefined,
  owner: string,
): ISolanaTokenBalance | null => {
  if (balances === undefined) {
    return null;
  }

  const normalizedOwner: string = owner.trim();
  const matched = balances.find(
    (balance: ISolanaTokenBalance): boolean =>
      typeof balance.owner === 'string' && balance.owner === normalizedOwner,
  );

  return matched ?? null;
};

const resolveSplDirection = (
  splDeltaRaw: bigint | null,
  nativeDirection: HistoryDirection,
): HistoryDirection => {
  if (splDeltaRaw === null || splDeltaRaw === BigInt(0)) {
    return nativeDirection;
  }

  return splDeltaRaw > BigInt(0) ? HistoryDirection.IN : HistoryDirection.OUT;
};

const resolveSplValueRaw = (splDeltaRaw: bigint | null): string => {
  if (splDeltaRaw === null) {
    return BigInt(0).toString();
  }

  return (splDeltaRaw < BigInt(0) ? -splDeltaRaw : splDeltaRaw).toString();
};

export const resolveSolanaSplAmountDeltaRaw = (
  value: ISolanaTransactionValue,
  trackedAddress: string,
): bigint | null => {
  const preBalance: ISolanaTokenBalance | null = selectTokenBalanceByOwner(
    value.meta?.preTokenBalances,
    trackedAddress,
  );
  const postBalance: ISolanaTokenBalance | null = selectTokenBalanceByOwner(
    value.meta?.postTokenBalances,
    trackedAddress,
  );
  const preAmountRaw: bigint = parseTokenAmountRaw(preBalance) ?? BigInt(0);
  const postAmountRaw: bigint = parseTokenAmountRaw(postBalance) ?? BigInt(0);

  return postAmountRaw - preAmountRaw;
};

export const resolveSolanaTransferDetails = (
  accountKeys: readonly string[],
  value: ISolanaTransactionValue,
  trackedAddress: string,
): ISolanaTransferDetails | null => {
  const deltaLamports: number = resolveSolanaLamportsDelta(accountKeys, value, trackedAddress);
  const isSplTransfer: boolean = detectSolanaSplTransfer(value);
  const splDeltaRaw: bigint | null = isSplTransfer
    ? resolveSolanaSplAmountDeltaRaw(value, trackedAddress)
    : null;
  const nativeDirection: HistoryDirection = resolveSolanaDirectionByLamportsDelta(deltaLamports);
  const direction: HistoryDirection = resolveSplDirection(splDeltaRaw, nativeDirection);
  const valueRaw: string = isSplTransfer
    ? resolveSplValueRaw(splDeltaRaw)
    : Math.abs(deltaLamports).toString();

  if (valueRaw === '0') {
    return null;
  }

  return {
    valueRaw,
    direction,
    assetSymbol: isSplTransfer ? 'SPL' : 'SOL',
    assetDecimals: isSplTransfer ? SPL_TOKEN_DECIMALS : SOL_NATIVE_DECIMALS,
  };
};

export const extractSolanaAccountKeys = (value: ISolanaTransactionValue): readonly string[] => {
  const rawAccountKeys: readonly (string | { readonly pubkey?: string })[] =
    value.transaction?.message?.accountKeys ?? [];

  return rawAccountKeys
    .map((accountKey): string | null => {
      if (typeof accountKey === 'string') {
        return accountKey;
      }

      if (typeof accountKey.pubkey === 'string') {
        return accountKey.pubkey;
      }

      return null;
    })
    .filter((accountKey: string | null): accountKey is string => accountKey !== null);
};

export const resolveSolanaFromTo = (accountKeys: readonly string[]): readonly [string, string] => {
  const fromAddress: string = accountKeys[0] ?? 'unknown';
  const toAddress: string = accountKeys[1] ?? 'unknown';

  return [fromAddress, toAddress];
};

export const resolveSolanaTimestampSec = (
  value: ISolanaTransactionValue,
  signatureInfo: ISolanaSignatureInfo,
): number => {
  if (typeof value.blockTime === 'number') {
    return value.blockTime;
  }

  if (typeof signatureInfo.blockTime === 'number') {
    return signatureInfo.blockTime;
  }

  return Math.floor(Date.now() / 1000);
};

export const matchSolanaHistoryKind = (item: IHistoryItemDto, kind: HistoryKind): boolean => {
  if (kind === HistoryKind.ALL) {
    return true;
  }

  if (kind === HistoryKind.ETH) {
    return item.assetSymbol === 'SOL';
  }

  return item.assetSymbol === 'SPL';
};

export const matchSolanaHistoryDirection = (
  item: IHistoryItemDto,
  direction: HistoryDirectionFilter,
): boolean => {
  if (direction === HistoryDirectionFilter.ALL) {
    return true;
  }

  if (direction === HistoryDirectionFilter.IN) {
    return item.direction === HistoryDirection.IN;
  }

  return item.direction === HistoryDirection.OUT;
};
