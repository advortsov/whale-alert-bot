import type {
  ITronGridNativeContractItem,
  ITronGridNativeRetItem,
  ITronGridNativeTransactionItem,
  ITronGridTrc20TokenInfo,
  ITronGridTrc20TransactionItem,
} from './tron-grid-history.interfaces';
import {
  HistoryDirection,
  HistoryItemType,
  type IHistoryItemDto,
} from '../../../features/tracking/dto/history-item.dto';
import { HistoryDirectionFilter } from '../../../features/tracking/dto/history-request.dto';
import type { TronAddressCodec } from '../../../modules/chains/tron/tron-address.codec';

const TRX_NATIVE_DECIMALS = 6;

interface IResolvedNativeTransactionContext {
  readonly txHash: string;
  readonly timestampSec: number;
  readonly fromAddress: string;
  readonly toAddress: string;
  readonly valueRaw: string;
  readonly contractType: string;
  readonly isError: boolean;
}

export class TronGridHistoryMapper {
  public constructor(
    private readonly tronAddressCodec: TronAddressCodec,
    private readonly tronscanTxBaseUrl: string,
  ) {}

  public parseNativeTransactionItem(value: unknown): ITronGridNativeTransactionItem | null {
    const record: Record<string, unknown> | null = this.parseRecord(value);

    if (record === null) {
      return null;
    }

    const txId: string | null = this.normalizeString(record['txID']);
    const blockTimestamp: number | null = this.normalizeTimestampMs(record['block_timestamp']);
    const rawDataRecord: Record<string, unknown> | null = this.parseRecord(record['raw_data']);
    const contractRaw: unknown = rawDataRecord?.['contract'];

    if (txId === null || blockTimestamp === null || !Array.isArray(contractRaw)) {
      return null;
    }

    const contracts: ITronGridNativeContractItem[] = contractRaw
      .map((contractItem: unknown): ITronGridNativeContractItem | null =>
        this.parseNativeContractItem(contractItem),
      )
      .filter(
        (
          contractItem: ITronGridNativeContractItem | null,
        ): contractItem is ITronGridNativeContractItem => contractItem !== null,
      );
    const retRaw: unknown = record['ret'];
    const ret: readonly ITronGridNativeRetItem[] | undefined = this.parseRetItems(retRaw);

    return {
      txID: txId,
      block_timestamp: blockTimestamp,
      raw_data: {
        contract: contracts,
      },
      ret,
    };
  }

  public parseTrc20TransactionItem(value: unknown): ITronGridTrc20TransactionItem | null {
    const record: Record<string, unknown> | null = this.parseRecord(value);

    if (record === null) {
      return null;
    }

    const txId: string | null = this.normalizeString(record['transaction_id']);
    const blockTimestamp: number | null = this.normalizeTimestampMs(record['block_timestamp']);

    if (txId === null || blockTimestamp === null) {
      return null;
    }

    return {
      transaction_id: txId,
      block_timestamp: blockTimestamp,
      from: this.normalizeString(record['from']) ?? undefined,
      to: this.normalizeString(record['to']) ?? undefined,
      value: this.normalizeUnsignedValue(record['value']) ?? undefined,
      token_info: this.parseTokenInfo(record['token_info']),
    };
  }

  public mapNativeTransaction(
    item: ITronGridNativeTransactionItem,
    trackedAddress: string,
  ): IHistoryItemDto | null {
    const context: IResolvedNativeTransactionContext | null = this.resolveNativeContext(item);

    if (context === null || this.shouldSkipNativeContext(context)) {
      return null;
    }

    return {
      txHash: context.txHash,
      timestampSec: context.timestampSec,
      from: context.fromAddress,
      to: context.toAddress,
      valueRaw: context.valueRaw,
      isError: context.isError,
      assetSymbol: 'TRX',
      assetDecimals: TRX_NATIVE_DECIMALS,
      eventType: HistoryItemType.TRANSFER,
      direction: this.resolveDirection(trackedAddress, context.fromAddress, context.toAddress),
      txLink: `${this.tronscanTxBaseUrl}${context.txHash}`,
    };
  }

  public mapTrc20Transaction(
    item: ITronGridTrc20TransactionItem,
    trackedAddress: string,
  ): IHistoryItemDto | null {
    const txHash: string | null = this.normalizeString(item.transaction_id);
    const blockTimestampMs: number | null = this.normalizeTimestampMs(item.block_timestamp);

    if (txHash === null || blockTimestampMs === null) {
      return null;
    }

    const fromAddress: string = this.normalizeTronAddress(item.from);
    const toAddress: string = this.normalizeTronAddress(item.to);
    const valueRaw: string = this.normalizeUnsignedValue(item.value) ?? '0';
    const symbol: string = this.normalizeString(item.token_info?.symbol) ?? 'TRC20';
    const decimals: number = this.normalizeTokenDecimals(item.token_info?.decimals);

    return {
      txHash,
      timestampSec: Math.floor(blockTimestampMs / 1000),
      from: fromAddress,
      to: toAddress,
      valueRaw,
      isError: false,
      assetSymbol: symbol,
      assetDecimals: decimals,
      eventType: HistoryItemType.TRANSFER,
      direction: this.resolveDirection(trackedAddress, fromAddress, toAddress),
      txLink: `${this.tronscanTxBaseUrl}${txHash}`,
    };
  }

  public applyDirectionFilter(
    items: readonly IHistoryItemDto[],
    directionFilter: HistoryDirectionFilter,
  ): readonly IHistoryItemDto[] {
    if (directionFilter === HistoryDirectionFilter.ALL) {
      return items;
    }

    const targetDirection: HistoryDirection =
      directionFilter === HistoryDirectionFilter.IN ? HistoryDirection.IN : HistoryDirection.OUT;

    return items.filter((item: IHistoryItemDto): boolean => item.direction === targetDirection);
  }

  private resolveNativeContext(
    item: ITronGridNativeTransactionItem,
  ): IResolvedNativeTransactionContext | null {
    const txHash: string | null = this.normalizeString(item.txID);
    const blockTimestampMs: number | null = this.normalizeTimestampMs(item.block_timestamp);
    const contract: ITronGridNativeContractItem | null = this.resolvePrimaryContract(item);

    if (txHash === null || blockTimestampMs === null || contract === null) {
      return null;
    }

    const contractType: string = this.resolveContractType(contract);
    const fromAddress: string = this.resolveFromAddress(contract);
    const toAddress: string = this.resolveToAddress(contract, contractType);
    const valueRaw: string = this.resolveNativeValueRaw(contract);

    return {
      txHash,
      timestampSec: Math.floor(blockTimestampMs / 1000),
      fromAddress,
      toAddress,
      valueRaw,
      contractType,
      isError: this.resolveIsError(item.ret),
    };
  }

  private shouldSkipNativeContext(context: IResolvedNativeTransactionContext): boolean {
    if (context.contractType === 'TransferContract') {
      return false;
    }

    return context.valueRaw === '0';
  }

  private resolveContractType(contract: ITronGridNativeContractItem): string {
    return this.normalizeString(contract.type) ?? '';
  }

  private resolveFromAddress(contract: ITronGridNativeContractItem): string {
    return this.normalizeTronAddress(contract.parameter?.value?.owner_address);
  }

  private resolveToAddress(contract: ITronGridNativeContractItem, contractType: string): string {
    if (contractType === 'TransferContract') {
      return this.normalizeTronAddress(contract.parameter?.value?.to_address);
    }

    return this.normalizeTronAddress(contract.parameter?.value?.contract_address);
  }

  private resolveNativeValueRaw(contract: ITronGridNativeContractItem): string {
    const amountRawFromTransfer: string | null = this.normalizeUnsignedValue(
      contract.parameter?.value?.amount,
    );
    const amountRawFromCall: string | null = this.normalizeUnsignedValue(
      contract.parameter?.value?.call_value,
    );

    return amountRawFromTransfer ?? amountRawFromCall ?? '0';
  }

  private parseNativeContractItem(value: unknown): ITronGridNativeContractItem | null {
    const record: Record<string, unknown> | null = this.parseRecord(value);

    if (record === null) {
      return null;
    }

    const contractType: string | null = this.normalizeString(record['type']);
    const parameterRecord: Record<string, unknown> | null = this.parseRecord(record['parameter']);
    const valueRecord: Record<string, unknown> | null = this.parseRecord(
      parameterRecord?.['value'],
    );

    if (contractType === null || valueRecord === null) {
      return null;
    }

    return {
      type: contractType,
      parameter: {
        value: {
          owner_address: this.normalizeString(valueRecord['owner_address']) ?? undefined,
          to_address: this.normalizeString(valueRecord['to_address']) ?? undefined,
          contract_address: this.normalizeString(valueRecord['contract_address']) ?? undefined,
          amount: this.normalizeUnsignedValue(valueRecord['amount']) ?? undefined,
          call_value: this.normalizeUnsignedValue(valueRecord['call_value']) ?? undefined,
        },
      },
    };
  }

  private parseRetItems(value: unknown): readonly ITronGridNativeRetItem[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value
      .map((retValue: unknown): ITronGridNativeRetItem | null => {
        const retRecord: Record<string, unknown> | null = this.parseRecord(retValue);

        if (retRecord === null) {
          return null;
        }

        const contractRet: string | null = this.normalizeString(retRecord['contractRet']);

        if (contractRet === null) {
          return null;
        }

        return {
          contractRet,
        };
      })
      .filter(
        (retItem: ITronGridNativeRetItem | null): retItem is ITronGridNativeRetItem =>
          retItem !== null,
      );
  }

  private parseTokenInfo(value: unknown): ITronGridTrc20TokenInfo | undefined {
    const record: Record<string, unknown> | null = this.parseRecord(value);

    if (record === null) {
      return undefined;
    }

    return {
      symbol: this.normalizeString(record['symbol']) ?? undefined,
      decimals: this.normalizeTokenDecimals(record['decimals']),
    };
  }

  private resolvePrimaryContract(
    item: ITronGridNativeTransactionItem,
  ): ITronGridNativeContractItem | null {
    const contracts: readonly ITronGridNativeContractItem[] | undefined = item.raw_data?.contract;

    if (!contracts || contracts.length === 0) {
      return null;
    }

    return contracts[0] ?? null;
  }

  private resolveDirection(
    trackedAddress: string,
    fromAddress: string,
    toAddress: string,
  ): HistoryDirection {
    const normalizedTrackedAddress: string | null = this.tronAddressCodec.normalize(trackedAddress);
    const normalizedFrom: string | null = this.tronAddressCodec.normalize(fromAddress);
    const normalizedTo: string | null = this.tronAddressCodec.normalize(toAddress);

    if (normalizedTrackedAddress === null) {
      return HistoryDirection.UNKNOWN;
    }

    if (normalizedFrom === normalizedTrackedAddress && normalizedTo !== normalizedTrackedAddress) {
      return HistoryDirection.OUT;
    }

    if (normalizedTo === normalizedTrackedAddress && normalizedFrom !== normalizedTrackedAddress) {
      return HistoryDirection.IN;
    }

    return HistoryDirection.UNKNOWN;
  }

  private resolveIsError(retItems: readonly ITronGridNativeRetItem[] | undefined): boolean {
    if (!retItems || retItems.length === 0) {
      return false;
    }

    for (const retItem of retItems) {
      const contractRet: string | null = this.normalizeString(retItem.contractRet);

      if (contractRet !== null && contractRet !== 'SUCCESS') {
        return true;
      }
    }

    return false;
  }

  private normalizeTronAddress(rawAddress: string | undefined): string {
    if (typeof rawAddress !== 'string') {
      return 'unknown';
    }

    return this.tronAddressCodec.normalize(rawAddress) ?? rawAddress.trim();
  }

  private normalizeString(rawValue: unknown): string | null {
    if (typeof rawValue !== 'string') {
      return null;
    }

    const normalizedValue: string = rawValue.trim();

    if (normalizedValue.length === 0) {
      return null;
    }

    return normalizedValue;
  }

  private normalizeTimestampMs(rawValue: unknown): number | null {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue <= 0) {
      return null;
    }

    return Math.floor(rawValue);
  }

  private normalizeUnsignedValue(rawValue: unknown): string | null {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue >= 0) {
      return Math.floor(rawValue).toString();
    }

    if (typeof rawValue !== 'string') {
      return null;
    }

    const normalizedValue: string = rawValue.trim();

    if (!/^\d+$/.test(normalizedValue)) {
      return null;
    }

    return normalizedValue;
  }

  private normalizeTokenDecimals(rawValue: unknown): number {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue >= 0) {
      return Math.floor(rawValue);
    }

    if (typeof rawValue === 'string' && /^\d+$/.test(rawValue.trim())) {
      return Number.parseInt(rawValue.trim(), 10);
    }

    return 0;
  }

  private parseRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    return value as Record<string, unknown>;
  }
}
