import { describe, expect, it } from 'vitest';

import { CexAddressBookService } from './cex-address-book.service';
import { ChainKey } from '../common/interfaces/chain-key.interfaces';
import type { AppConfigService } from '../config/app-config.service';

describe('CexAddressBookService', (): void => {
  it('resolves known exchange address from built-in map', (): void => {
    const configStub: Pick<AppConfigService, 'ethCexAddressAllowlist'> = {
      ethCexAddressAllowlist: [],
    };
    const service: CexAddressBookService = new CexAddressBookService(
      configStub as AppConfigService,
    );

    const tag: string | null = service.resolveTag(
      ChainKey.ETHEREUM_MAINNET,
      '0x28C6c06298d514Db089934071355E5743bf21d60',
    );

    expect(tag).toBe('binance');
  });

  it('resolves custom exchange address from env allowlist', (): void => {
    const configStub: Pick<AppConfigService, 'ethCexAddressAllowlist'> = {
      ethCexAddressAllowlist: ['0x96b0Dc619A86572524c15C1fC9c42DA9A94BCAa0'],
    };
    const service: CexAddressBookService = new CexAddressBookService(
      configStub as AppConfigService,
    );

    const tag: string | null = service.resolveTag(
      ChainKey.ETHEREUM_MAINNET,
      '0x96b0Dc619A86572524c15C1fC9c42DA9A94BCAa0',
    );

    expect(tag).toBe('custom_cex');
  });
});
