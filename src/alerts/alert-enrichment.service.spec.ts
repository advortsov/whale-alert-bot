import { beforeAll, describe, expect, it } from 'vitest';

import { AlertEnrichmentService } from './alert-enrichment.service';
import { TokenMetadataService } from './token-metadata.service';
import { applyTestEnv } from '../../test/helpers/test-env';
import {
  AssetStandard,
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
} from '../common/interfaces/chain.types';
import { AppConfigService } from '../config/app-config.service';

describe('AlertEnrichmentService', (): void => {
  beforeAll((): void => {
    applyTestEnv();
  });

  it('enriches transfer event with token metadata and formatted value', (): void => {
    const tokenMetadataService: TokenMetadataService = new TokenMetadataService(
      new AppConfigService(),
    );
    const service: AlertEnrichmentService = new AlertEnrichmentService(tokenMetadataService);

    const event: ClassifiedEvent = {
      chainId: ChainId.ETHEREUM_MAINNET,
      txHash: '0xtx',
      logIndex: 1,
      trackedAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      eventType: ClassifiedEventType.TRANSFER,
      direction: EventDirection.IN,
      assetStandard: AssetStandard.ERC20,
      contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      tokenAddress: null,
      tokenSymbol: null,
      tokenDecimals: null,
      tokenAmountRaw: '12345000',
      valueFormatted: null,
      counterpartyAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      dex: null,
      pair: null,
    };

    const enrichedEvent: ClassifiedEvent = service.enrich(event);

    expect(enrichedEvent.tokenSymbol).toBe('USDT');
    expect(enrichedEvent.tokenDecimals).toBe(6);
    expect(enrichedEvent.valueFormatted).toBe('12.345000');
  });
});
