import { describe, expect, it } from 'vitest';

import { SolanaEventClassifierService } from './solana-event-classifier.service';
import {
  AssetStandard,
  ChainId,
  ClassifiedEventType,
  EventDirection,
} from '../../common/interfaces/chain.types';
import type { IClassificationContextDto } from '../../modules/blockchain/base/chain-classifier.interfaces';

describe('SolanaEventClassifierService', (): void => {
  it('classifies SPL transfer when receipt contains token program log', (): void => {
    const service: SolanaEventClassifierService = new SolanaEventClassifierService();
    const context: IClassificationContextDto = {
      chainId: ChainId.SOLANA_MAINNET,
      txHash: 'sol-tx-1',
      trackedAddress: '11111111111111111111111111111111',
      txFrom: '11111111111111111111111111111111',
      txTo: '22222222222222222222222222222222',
      receiptEnvelope: {
        txHash: 'sol-tx-1',
        logs: [
          {
            address: 'solana-log',
            topics: [],
            data: 'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [1]',
            logIndex: 0,
          },
        ],
      },
    };

    const result = service.classify(context).event;

    expect(result.eventType).toBe(ClassifiedEventType.TRANSFER);
    expect(result.direction).toBe(EventDirection.OUT);
    expect(result.assetStandard).toBe(AssetStandard.SPL);
    expect(result.tokenSymbol).toBe('SPL');
  });

  it('classifies native SOL transfer when SPL logs are absent', (): void => {
    const service: SolanaEventClassifierService = new SolanaEventClassifierService();
    const context: IClassificationContextDto = {
      chainId: ChainId.SOLANA_MAINNET,
      txHash: 'sol-tx-2',
      trackedAddress: '33333333333333333333333333333333',
      txFrom: '44444444444444444444444444444444',
      txTo: '33333333333333333333333333333333',
      receiptEnvelope: null,
    };

    const result = service.classify(context).event;

    expect(result.eventType).toBe(ClassifiedEventType.TRANSFER);
    expect(result.direction).toBe(EventDirection.IN);
    expect(result.assetStandard).toBe(AssetStandard.NATIVE);
    expect(result.tokenSymbol).toBe('SOL');
  });

  it('marks event as unknown when tracked address does not match tx parties', (): void => {
    const service: SolanaEventClassifierService = new SolanaEventClassifierService();
    const context: IClassificationContextDto = {
      chainId: ChainId.SOLANA_MAINNET,
      txHash: 'sol-tx-3',
      trackedAddress: '55555555555555555555555555555555',
      txFrom: '11111111111111111111111111111111',
      txTo: '22222222222222222222222222222222',
      receiptEnvelope: null,
    };

    const result = service.classify(context).event;

    expect(result.eventType).toBe(ClassifiedEventType.UNKNOWN);
    expect(result.direction).toBe(EventDirection.UNKNOWN);
  });
});
