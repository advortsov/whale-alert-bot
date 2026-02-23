import { describe, expect, it, vi } from 'vitest';

import { WalletsController } from './wallets.controller';
import type { TelegramUserRef } from '../../whales/entities/tracking.interfaces';
import type { TrackingService } from '../../whales/services/tracking.service';

type TrackingServiceStub = {
  readonly unmuteWallet: ReturnType<typeof vi.fn>;
  readonly getAddressHistoryPageWithPolicy: ReturnType<typeof vi.fn>;
};

describe('WalletsController', (): void => {
  it('unmutes wallet by id via tracking service', async (): Promise<void> => {
    const trackingServiceStub: TrackingServiceStub = {
      unmuteWallet: vi.fn().mockResolvedValue({
        walletId: 16,
        mutedUntil: null,
      }),
      getAddressHistoryPageWithPolicy: vi.fn(),
    };
    const controller: WalletsController = new WalletsController(
      trackingServiceStub as unknown as TrackingService,
    );
    const user: TelegramUserRef = {
      telegramId: '42',
      username: 'tester',
    };

    const result = await controller.unmuteWallet(user, 16);

    expect(trackingServiceStub.unmuteWallet).toHaveBeenCalledWith(user, '#16');
    expect(result).toEqual({
      walletId: 16,
      mutedUntil: null,
    });
  });

  it('returns structured wallet history page with items and nextOffset', async (): Promise<void> => {
    const trackingServiceStub: TrackingServiceStub = {
      unmuteWallet: vi.fn(),
      getAddressHistoryPageWithPolicy: vi.fn().mockResolvedValue({
        message: 'history',
        resolvedAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        walletId: 16,
        limit: 20,
        offset: 0,
        kind: 'all',
        direction: 'all',
        hasNextPage: true,
        nextOffset: 20,
        items: [
          {
            txHash: '0xabc',
            occurredAt: '2026-02-23T00:00:00.000Z',
            eventType: 'TRANSFER',
            direction: 'OUT',
            amountText: '1.000000 ETH',
            txUrl: 'https://etherscan.io/tx/0xabc',
            assetSymbol: 'ETH',
            chainKey: 'ethereum_mainnet',
          },
        ],
      }),
    };
    const controller: WalletsController = new WalletsController(
      trackingServiceStub as unknown as TrackingService,
    );
    const user: TelegramUserRef = {
      telegramId: '42',
      username: 'tester',
    };

    const result = await controller.getWalletHistory(user, 16, {
      limit: '20',
      offset: '0',
    });

    expect(trackingServiceStub.getAddressHistoryPageWithPolicy).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
    expect(result.nextOffset).toBe(20);
  });
});
