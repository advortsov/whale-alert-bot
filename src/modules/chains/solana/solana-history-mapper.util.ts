import type {
  ISolanaSignatureInfo,
  ISolanaTransactionValue,
} from './solana-rpc-history.interfaces';
import { HistoryDirection, type IHistoryItemDto } from '../../whales/entities/history-item.dto';
import { HistoryDirectionFilter, HistoryKind } from '../../whales/entities/history-request.dto';

const SPL_TOKEN_PROGRAM_SUBSTRING = 'tokenkeg';

export const parseSolanaTransactionValue = (payload: unknown): ISolanaTransactionValue => {
  if (typeof payload !== 'object') {
    throw new Error('Solana getTransaction returned invalid payload.');
  }

  return payload as ISolanaTransactionValue;
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
