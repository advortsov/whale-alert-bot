import { ERC20_TRANSFER_TOPIC, UNISWAP_V2_SWAP_TOPIC } from './constants/event-signatures';
import { EventClassifierService } from './event-classifier.service';
import { applyTestEnv } from '../../test/helpers/test-env';
import {
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ObservedTransaction,
} from '../common/interfaces/chain.types';
import { AppConfigService } from '../config/app-config.service';

const buildTransferEvent = (): ObservedTransaction => {
  return {
    chainId: ChainId.ETHEREUM_MAINNET,
    txHash: '0xtx',
    trackedAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    txFrom: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    txTo: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    logs: [
      {
        address: '0xcccccccccccccccccccccccccccccccccccccccc',
        topics: [
          ERC20_TRANSFER_TOPIC,
          '0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          '0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        ],
        data: '0x0a',
        logIndex: 12,
      },
    ],
  };
};

describe('EventClassifierService', (): void => {
  beforeAll((): void => {
    applyTestEnv();
  });

  it('classifies transfer log when tracked address is sender', (): void => {
    const service: EventClassifierService = new EventClassifierService(new AppConfigService());
    const event = buildTransferEvent();

    const result = service.classify(event);

    expect(result.eventType).toBe(ClassifiedEventType.TRANSFER);
    expect(result.logIndex).toBe(12);
    expect(result.direction).toBe(EventDirection.OUT);
    expect(result.tokenAddress).toBe('0xcccccccccccccccccccccccccccccccccccccccc');
    expect(result.tokenAmountRaw).toBe('10');
  });

  it('classifies swap log when pool is in allowlist', (): void => {
    const service: EventClassifierService = new EventClassifierService(new AppConfigService());

    const event: ObservedTransaction = {
      chainId: ChainId.ETHEREUM_MAINNET,
      txHash: '0xtx2',
      trackedAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      txFrom: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      txTo: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      logs: [
        {
          address: '0x1111111111111111111111111111111111111111',
          topics: [UNISWAP_V2_SWAP_TOPIC],
          data: '0x',
          logIndex: 7,
        },
      ],
    };

    const result = service.classify(event);

    expect(result.eventType).toBe(ClassifiedEventType.SWAP);
    expect(result.direction).toBe(EventDirection.OUT);
    expect(result.dex).toBe('Uniswap V2');
  });
});
