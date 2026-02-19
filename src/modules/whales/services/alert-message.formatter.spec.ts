import { AlertMessageFormatter } from './alert-message.formatter';
import { applyTestEnv } from '../../../../test/helpers/test-env';
import {
  AssetStandard,
  ClassifiedEventType,
  ChainId,
  EventDirection,
  type ClassifiedEvent,
} from '../../../common/interfaces/chain.types';
import { AppConfigService } from '../../../config/app-config.service';

describe('AlertMessageFormatter', (): void => {
  beforeAll((): void => {
    applyTestEnv();
  });

  it('formats transfer alert with usd context', (): void => {
    const formatter: AlertMessageFormatter = new AlertMessageFormatter(new AppConfigService());

    const event: ClassifiedEvent = {
      chainId: ChainId.ETHEREUM_MAINNET,
      txHash: '0xabc',
      logIndex: 1,
      trackedAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      eventType: ClassifiedEventType.TRANSFER,
      direction: EventDirection.OUT,
      assetStandard: AssetStandard.ERC20,
      contractAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
      tokenAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
      tokenSymbol: 'USDT',
      tokenDecimals: 6,
      tokenAmountRaw: '1000',
      valueFormatted: '0.001000',
      counterpartyAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      dex: null,
      pair: null,
    };

    const result: string = formatter.format(event, {
      usdAmount: 123.45,
      usdUnavailable: false,
    });

    expect(result).toContain('TRANSFER');
    expect(result).toContain('OUT');
    expect(result).toContain('Сумма: 0.001000 USDT');
    expect(result).toContain('USD: ~$123.45');
  });
});
