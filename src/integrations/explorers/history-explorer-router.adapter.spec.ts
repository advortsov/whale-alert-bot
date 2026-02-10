import { describe, expect, it, vi } from 'vitest';

import { HistoryExplorerRouterAdapter } from './history-explorer-router.adapter';
import { ChainKey } from '../../core/chains/chain-key.interfaces';
import {
  HistoryDirectionFilter,
  HistoryKind,
} from '../../features/tracking/dto/history-request.dto';

describe('HistoryExplorerRouterAdapter', (): void => {
  it('routes Ethereum request to etherscan adapter', async (): Promise<void> => {
    const etherscanHistoryAdapterStub = {
      loadRecentTransactions: vi.fn().mockResolvedValue({
        items: [],
        nextOffset: null,
      }),
    };
    const solanaHistoryAdapterStub = {
      loadRecentTransactions: vi.fn().mockResolvedValue({
        items: [],
        nextOffset: null,
      }),
    };
    const tronHistoryAdapterStub = {
      loadRecentTransactions: vi.fn().mockResolvedValue({
        items: [],
        nextOffset: null,
      }),
    };

    const adapter: HistoryExplorerRouterAdapter = new HistoryExplorerRouterAdapter(
      etherscanHistoryAdapterStub as never,
      solanaHistoryAdapterStub as never,
      tronHistoryAdapterStub as never,
    );

    const result = await adapter.loadRecentTransactions({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      limit: 5,
      offset: 0,
      kind: HistoryKind.ALL,
      direction: HistoryDirectionFilter.ALL,
      minAmountUsd: null,
    });

    expect(result).toEqual({
      items: [],
      nextOffset: null,
    });
    expect(etherscanHistoryAdapterStub.loadRecentTransactions).toHaveBeenCalledTimes(1);
    expect(solanaHistoryAdapterStub.loadRecentTransactions).not.toHaveBeenCalled();
    expect(tronHistoryAdapterStub.loadRecentTransactions).not.toHaveBeenCalled();
  });

  it('routes Solana request to solana history adapter', async (): Promise<void> => {
    const etherscanHistoryAdapterStub = {
      loadRecentTransactions: vi.fn().mockResolvedValue({
        items: [],
        nextOffset: null,
      }),
    };
    const solanaHistoryAdapterStub = {
      loadRecentTransactions: vi.fn().mockResolvedValue({
        items: [{ txHash: 'sol-signature' }],
        nextOffset: 10,
      }),
    };
    const tronHistoryAdapterStub = {
      loadRecentTransactions: vi.fn().mockResolvedValue({
        items: [],
        nextOffset: null,
      }),
    };

    const adapter: HistoryExplorerRouterAdapter = new HistoryExplorerRouterAdapter(
      etherscanHistoryAdapterStub as never,
      solanaHistoryAdapterStub as never,
      tronHistoryAdapterStub as never,
    );

    const result = await adapter.loadRecentTransactions({
      chainKey: ChainKey.SOLANA_MAINNET,
      address: '11111111111111111111111111111111',
      limit: 10,
      offset: 0,
      kind: HistoryKind.ALL,
      direction: HistoryDirectionFilter.ALL,
      minAmountUsd: null,
    });

    expect(result).toEqual({
      items: [{ txHash: 'sol-signature' }],
      nextOffset: 10,
    });
    expect(solanaHistoryAdapterStub.loadRecentTransactions).toHaveBeenCalledTimes(1);
    expect(etherscanHistoryAdapterStub.loadRecentTransactions).not.toHaveBeenCalled();
    expect(tronHistoryAdapterStub.loadRecentTransactions).not.toHaveBeenCalled();
  });

  it('routes TRON request to tron history adapter', async (): Promise<void> => {
    const etherscanHistoryAdapterStub = {
      loadRecentTransactions: vi.fn().mockResolvedValue({
        items: [],
        nextOffset: null,
      }),
    };
    const solanaHistoryAdapterStub = {
      loadRecentTransactions: vi.fn().mockResolvedValue({
        items: [],
        nextOffset: null,
      }),
    };
    const tronHistoryAdapterStub = {
      loadRecentTransactions: vi.fn().mockResolvedValue({
        items: [{ txHash: 'tron-tx' }],
        nextOffset: null,
      }),
    };

    const adapter: HistoryExplorerRouterAdapter = new HistoryExplorerRouterAdapter(
      etherscanHistoryAdapterStub as never,
      solanaHistoryAdapterStub as never,
      tronHistoryAdapterStub as never,
    );

    const result = await adapter.loadRecentTransactions({
      chainKey: ChainKey.TRON_MAINNET,
      address: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
      limit: 10,
      offset: 0,
      kind: HistoryKind.ALL,
      direction: HistoryDirectionFilter.ALL,
      minAmountUsd: null,
    });

    expect(result).toEqual({
      items: [{ txHash: 'tron-tx' }],
      nextOffset: null,
    });
    expect(tronHistoryAdapterStub.loadRecentTransactions).toHaveBeenCalledTimes(1);
    expect(etherscanHistoryAdapterStub.loadRecentTransactions).not.toHaveBeenCalled();
    expect(solanaHistoryAdapterStub.loadRecentTransactions).not.toHaveBeenCalled();
  });
});
