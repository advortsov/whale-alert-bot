import { describe, expect, it, vi } from 'vitest';

import type { CexAddressBookService } from './cex-address-book.service';
import { HistoryCardClassifierService } from './history-card-classifier.service';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import {
  HistoryAssetStandard,
  HistoryFlowType,
  HistoryTxType,
} from '../entities/history-card.interfaces';
import { HistoryDirection, HistoryItemType } from '../entities/history-item.dto';

describe('HistoryCardClassifierService', (): void => {
  const createService = (cexTag: string | null): HistoryCardClassifierService => {
    const cexAddressBookServiceStub: CexAddressBookService = {
      resolveTag: vi.fn().mockReturnValue(cexTag),
    } as unknown as CexAddressBookService;

    return new HistoryCardClassifierService(cexAddressBookServiceStub);
  };

  it('classifies dex flow for wallet event', (): void => {
    const service: HistoryCardClassifierService = createService(null);

    const result = service.classifyWalletEvent(ChainKey.ETHEREUM_MAINNET, {
      eventType: 'SWAP',
      counterpartyAddress: '0x1',
      dex: 'uniswap',
      contractAddress: null,
      tokenAddress: '0xtoken',
      tokenSymbol: 'USDT',
      assetStandard: 'ERC20',
      pair: 'ETH/USDT',
    } as never);

    expect(result.txType).toBe(HistoryTxType.SWAP);
    expect(result.flowType).toBe(HistoryFlowType.DEX);
    expect(result.flowLabel).toBe('DEX:uniswap');
    expect(result.assetStandard).toBe(HistoryAssetStandard.ERC20);
  });

  it('classifies cex flow only for ethereum', (): void => {
    const service: HistoryCardClassifierService = createService('binance');

    const ethResult = service.classifyExplorerItem(ChainKey.ETHEREUM_MAINNET, {
      txHash: '0x1',
      timestampSec: 1_700_000_000,
      from: '0xfrom',
      to: '0xto',
      valueRaw: '1',
      isError: false,
      assetSymbol: 'ETH',
      assetDecimals: 18,
      eventType: HistoryItemType.TRANSFER,
      direction: HistoryDirection.OUT,
      txLink: null,
    });
    const solResult = service.classifyExplorerItem(ChainKey.SOLANA_MAINNET, {
      txHash: 's1',
      timestampSec: 1_700_000_000,
      from: 'from',
      to: 'to',
      valueRaw: '1',
      isError: false,
      assetSymbol: 'SOL',
      assetDecimals: 9,
      eventType: HistoryItemType.TRANSFER,
      direction: HistoryDirection.OUT,
      txLink: null,
    });

    expect(ethResult.flowType).toBe(HistoryFlowType.CEX);
    expect(solResult.flowType).toBe(HistoryFlowType.P2P);
  });

  it('falls back to contract/unknown flow when no dex-cex markers exist', (): void => {
    const service: HistoryCardClassifierService = createService(null);

    const contractResult = service.classifyWalletEvent(ChainKey.TRON_MAINNET, {
      eventType: 'UNKNOWN',
      counterpartyAddress: null,
      dex: null,
      contractAddress: 'TContract',
      tokenAddress: null,
      tokenSymbol: null,
      assetStandard: null,
      pair: null,
      usdPrice: null,
      usdAmount: null,
      usdUnavailable: true,
      swapFromSymbol: null,
      swapFromAmountText: null,
      swapToSymbol: null,
      swapToAmountText: null,
    } as never);
    const unknownResult = service.classifyExplorerItem(ChainKey.TRON_MAINNET, {
      txHash: 't1',
      timestampSec: 1_700_000_000,
      from: 'from',
      to: 'to',
      valueRaw: '1',
      isError: false,
      assetSymbol: '',
      assetDecimals: 6,
      eventType: HistoryItemType.TRANSFER,
      direction: HistoryDirection.UNKNOWN,
      txLink: null,
    });

    expect(contractResult.flowType).toBe(HistoryFlowType.CONTRACT);
    expect(unknownResult.flowType).toBe(HistoryFlowType.UNKNOWN);
  });
});
