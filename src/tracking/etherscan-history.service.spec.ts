import { afterEach, describe, expect, it, vi } from 'vitest';

import { EtherscanHistoryService } from './etherscan-history.service';
import type { AppConfigService } from '../config/app-config.service';

class HistoryConfigStub {
  public readonly etherscanApiBaseUrl: string = 'https://api.etherscan.io/v2/api';
  public readonly etherscanApiKey: string | null = 'TEST_KEY';
}

describe('EtherscanHistoryService', (): void => {
  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('maps etherscan tx list response into history items', async (): Promise<void> => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async (): Promise<unknown> => ({
        status: '1',
        message: 'OK',
        result: [
          {
            hash: '0xabc',
            timeStamp: '1770587975',
            from: '0x1111111111111111111111111111111111111111',
            to: '0x2222222222222222222222222222222222222222',
            value: '1000000000000000000',
            isError: '0',
          },
        ],
      }),
    } as Response);

    const service: EtherscanHistoryService = new EtherscanHistoryService(
      new HistoryConfigStub() as unknown as AppConfigService,
    );
    const result = await service.loadRecentTransactions(
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      5,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        hash: '0xabc',
        timestampSec: 1770587975,
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        valueRaw: '1000000000000000000',
        isError: false,
        assetSymbol: 'ETH',
        assetDecimals: 18,
      },
    ]);
  });

  it('falls back to token tx list when normal tx list is empty', async (): Promise<void> => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<unknown> => ({
          status: '0',
          message: 'No transactions found',
          result: [],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<unknown> => ({
          status: '1',
          message: 'OK',
          result: [
            {
              hash: '0xtoken',
              timeStamp: '1770587975',
              from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              value: '19490000',
              tokenSymbol: 'USDC',
              tokenDecimal: '6',
            },
          ],
        }),
      } as Response);

    const service: EtherscanHistoryService = new EtherscanHistoryService(
      new HistoryConfigStub() as unknown as AppConfigService,
    );
    const result = await service.loadRecentTransactions(
      '0x96b0Dc619A86572524c15C1fC9c42DA9A94BCAa0',
      5,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      {
        hash: '0xtoken',
        timestampSec: 1770587975,
        from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        valueRaw: '19490000',
        isError: false,
        assetSymbol: 'USDC',
        assetDecimals: 6,
      },
    ]);
  });

  it('throws when etherscan returns api error', async (): Promise<void> => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async (): Promise<unknown> => ({
        status: '0',
        message: 'NOTOK',
        result: 'Max rate limit reached',
      }),
    } as Response);

    const service: EtherscanHistoryService = new EtherscanHistoryService(
      new HistoryConfigStub() as unknown as AppConfigService,
    );

    await expect(
      service.loadRecentTransactions('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 5),
    ).rejects.toThrow('Etherscan API error: Max rate limit reached');
  });
});
