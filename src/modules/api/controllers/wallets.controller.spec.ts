import { describe, expect, it, vi } from 'vitest';

import { WalletsController } from './wallets.controller';
import type { TelegramUserRef } from '../../whales/entities/tracking.interfaces';
import type { TrackingService } from '../../whales/services/tracking.service';

type TrackingServiceStub = {
  readonly unmuteWallet: ReturnType<typeof vi.fn>;
};

describe('WalletsController', (): void => {
  it('unmutes wallet by id via tracking service', async (): Promise<void> => {
    const trackingServiceStub: TrackingServiceStub = {
      unmuteWallet: vi.fn().mockResolvedValue({
        walletId: 16,
        mutedUntil: null,
      }),
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
});
