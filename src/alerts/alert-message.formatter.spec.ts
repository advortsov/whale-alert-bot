import { AlertMessageFormatter } from './alert-message.formatter';
import { applyTestEnv } from '../../test/helpers/test-env';
import { ClassifiedEventType, ChainId, type ClassifiedEvent } from '../chain/chain.types';
import { AppConfigService } from '../config/app-config.service';

describe('AlertMessageFormatter', (): void => {
  beforeAll((): void => {
    applyTestEnv();
  });

  it('formats transfer alert', (): void => {
    const formatter: AlertMessageFormatter = new AlertMessageFormatter(new AppConfigService());

    const event: ClassifiedEvent = {
      chainId: ChainId.ETHEREUM_MAINNET,
      txHash: '0xabc',
      logIndex: 1,
      trackedAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      eventType: ClassifiedEventType.TRANSFER,
      contractAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
      tokenAmountRaw: '1000',
      dex: null,
      pair: null,
    };

    const result: string = formatter.format(event);

    expect(result).toContain('TRANSFER');
    expect(result).toContain('0xabc');
  });
});
