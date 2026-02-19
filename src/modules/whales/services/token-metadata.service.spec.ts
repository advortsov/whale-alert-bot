import { beforeAll, describe, expect, it } from 'vitest';

import { TokenMetadataService } from './token-metadata.service';
import { applyTestEnv } from '../../../../test/helpers/test-env';
import { AppConfigService } from '../../../config/app-config.service';

describe('TokenMetadataService', (): void => {
  beforeAll((): void => {
    applyTestEnv();
  });

  it('returns known metadata for supported token contract', (): void => {
    const service: TokenMetadataService = new TokenMetadataService(new AppConfigService());

    const metadata = service.getMetadata('0xdAC17F958D2ee523a2206206994597C13D831ec7');

    expect(metadata.symbol).toBe('USDT');
    expect(metadata.decimals).toBe(6);
  });

  it('returns fallback metadata for unknown token contract', (): void => {
    const service: TokenMetadataService = new TokenMetadataService(new AppConfigService());

    const metadata = service.getMetadata('0x1111111111111111111111111111111111111111');

    expect(metadata.symbol).toBe('ERC20');
    expect(metadata.decimals).toBe(18);
  });
});
