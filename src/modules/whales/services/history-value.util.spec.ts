import { describe, expect, it } from 'vitest';

import {
  isZeroClassifiedEvent,
  isZeroExplorerHistoryItem,
  isZeroWalletEventHistory,
} from './history-value.util';
import {
  AssetStandard,
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
} from '../../../common/interfaces/chain.types';
import type { WalletEventHistoryView } from '../../../database/repositories/wallet-events.repository.interfaces';
import {
  HistoryDirection,
  HistoryItemType,
  type IHistoryItemDto,
} from '../entities/history-item.dto';

const buildClassifiedEvent = (overrides: Partial<ClassifiedEvent> = {}): ClassifiedEvent => ({
  chainId: ChainId.ETHEREUM_MAINNET,
  txHash: '0xhash',
  logIndex: 1,
  trackedAddress: '0xtracked',
  eventType: ClassifiedEventType.TRANSFER,
  direction: EventDirection.IN,
  assetStandard: AssetStandard.NATIVE,
  contractAddress: null,
  tokenAddress: null,
  tokenSymbol: 'ETH',
  tokenDecimals: 18,
  tokenAmountRaw: null,
  valueFormatted: '1.0',
  counterpartyAddress: null,
  dex: null,
  pair: null,
  usdPrice: null,
  usdAmount: null,
  usdUnavailable: true,
  swapFromSymbol: null,
  swapFromAmountText: null,
  swapToSymbol: null,
  swapToAmountText: null,
  ...overrides,
});

const buildWalletEvent = (
  overrides: Partial<WalletEventHistoryView> = {},
): WalletEventHistoryView => ({
  chainId: 1,
  chainKey: 'ethereum_mainnet',
  txHash: '0xhash',
  logIndex: 1,
  trackedAddress: '0xtracked',
  eventType: 'TRANSFER',
  direction: 'IN',
  assetStandard: 'NATIVE',
  contractAddress: null,
  tokenAddress: null,
  tokenSymbol: 'ETH',
  tokenDecimals: 18,
  tokenAmountRaw: null,
  valueFormatted: '1.0',
  counterpartyAddress: null,
  dex: null,
  pair: null,
  usdPrice: null,
  usdAmount: null,
  usdUnavailable: true,
  swapFromSymbol: null,
  swapFromAmountText: null,
  swapToSymbol: null,
  swapToAmountText: null,
  occurredAt: new Date('2026-02-25T00:00:00.000Z'),
  ...overrides,
});

const buildExplorerItem = (overrides: Partial<IHistoryItemDto> = {}): IHistoryItemDto => ({
  txHash: '0xhash',
  timestampSec: 1_750_000_000,
  from: '0xfrom',
  to: '0xto',
  valueRaw: '1',
  isError: false,
  assetSymbol: 'ETH',
  assetDecimals: 18,
  eventType: HistoryItemType.TRANSFER,
  direction: HistoryDirection.IN,
  txLink: 'https://etherscan.io/tx/0xhash',
  ...overrides,
});

describe('history-value.util', (): void => {
  it('treats tiny local wallet event amounts as zero by display precision', (): void => {
    const event: WalletEventHistoryView = buildWalletEvent({
      tokenAmountRaw: '10',
      tokenDecimals: 18,
      valueFormatted: '0.00000000000000001',
    });

    expect(isZeroWalletEventHistory(event)).toBe(true);
  });

  it('keeps meaningful local wallet event amounts', (): void => {
    const event: WalletEventHistoryView = buildWalletEvent({
      tokenAmountRaw: '1000000000000000',
      tokenDecimals: 18,
      valueFormatted: '0.001',
    });

    expect(isZeroWalletEventHistory(event)).toBe(false);
  });

  it('filters tiny explorer amounts that round to zero in UI', (): void => {
    const item: IHistoryItemDto = buildExplorerItem({
      valueRaw: '999999999999',
      assetDecimals: 18,
    });

    expect(isZeroExplorerHistoryItem(item)).toBe(true);
  });

  it('filters tiny classified event amounts before persistence', (): void => {
    const event: ClassifiedEvent = buildClassifiedEvent({
      tokenAmountRaw: '10',
      tokenDecimals: 18,
      valueFormatted: '0.00000000000000001',
    });

    expect(isZeroClassifiedEvent(event)).toBe(true);
  });
});
