import { describe, expect, it, vi } from 'vitest';

import type { EtherscanHistoryService } from './etherscan-history.service';
import type { TelegramUserRef } from './tracking.interfaces';
import { TrackingService } from './tracking.service';
import type { AppConfigService } from '../config/app-config.service';
import type { UserRow } from '../storage/database.types';
import type { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import type { TrackedWalletsRepository } from '../storage/repositories/tracked-wallets.repository';
import type { UsersRepository } from '../storage/repositories/users.repository';

type SubscriptionsRepositoryStub = {
  readonly addSubscription: ReturnType<typeof vi.fn>;
  readonly listByUserId: ReturnType<typeof vi.fn>;
  readonly removeByWalletId: ReturnType<typeof vi.fn>;
  readonly removeByAddress: ReturnType<typeof vi.fn>;
};

type UsersRepositoryStub = {
  readonly findOrCreate: ReturnType<typeof vi.fn>;
};

type TrackedWalletsRepositoryStub = {
  readonly findOrCreate: ReturnType<typeof vi.fn>;
};

type EtherscanHistoryServiceStub = {
  readonly loadRecentTransactions: ReturnType<typeof vi.fn>;
};

type AppConfigServiceStub = {
  readonly etherscanTxBaseUrl: string;
};

describe('TrackingService', (): void => {
  it('returns history by wallet id from user subscriptions', async (): Promise<void> => {
    const usersRepositoryStub: UsersRepositoryStub = {
      findOrCreate: vi.fn(),
    };
    const trackedWalletsRepositoryStub: TrackedWalletsRepositoryStub = {
      findOrCreate: vi.fn(),
    };
    const subscriptionsRepositoryStub: SubscriptionsRepositoryStub = {
      addSubscription: vi.fn(),
      listByUserId: vi.fn(),
      removeByWalletId: vi.fn(),
      removeByAddress: vi.fn(),
    };
    const etherscanHistoryServiceStub: EtherscanHistoryServiceStub = {
      loadRecentTransactions: vi.fn(),
    };
    const appConfigServiceStub: AppConfigServiceStub = {
      etherscanTxBaseUrl: 'https://etherscan.io/tx/',
    };
    const userRef: TelegramUserRef = {
      telegramId: '42',
      username: 'tester',
    };
    const userRow: UserRow = {
      id: 7,
      telegram_id: '42',
      username: 'tester',
      created_at: new Date('2026-02-01T00:00:00.000Z'),
    };

    usersRepositoryStub.findOrCreate.mockResolvedValue(userRow);
    subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: 3,
        walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        walletLabel: 'vitalik',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);
    etherscanHistoryServiceStub.loadRecentTransactions.mockResolvedValue([
      {
        hash: '0xabc',
        from: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        to: '0x0000000000000000000000000000000000000001',
        valueRaw: '1000000000000000000',
        isError: false,
        timestampSec: 1739160000,
        assetSymbol: 'ETH<1>',
        assetDecimals: 18,
      },
    ]);

    const service: TrackingService = new TrackingService(
      usersRepositoryStub as unknown as UsersRepository,
      trackedWalletsRepositoryStub as unknown as TrackedWalletsRepository,
      subscriptionsRepositoryStub as unknown as SubscriptionsRepository,
      etherscanHistoryServiceStub as unknown as EtherscanHistoryService,
      appConfigServiceStub as unknown as AppConfigService,
    );

    const message: string = await service.getAddressHistory(userRef, '#3', '1');

    expect(etherscanHistoryServiceStub.loadRecentTransactions).toHaveBeenCalledWith(
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      1,
    );
    expect(message).toContain(
      '📜 <b>История</b> <code>0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045</code>',
    );
    expect(message).toContain('<a href="https://etherscan.io/tx/0xabc">Tx #1</a>');
    expect(message).toContain('<b>1.000000 ETH&lt;1&gt;</b>');
  });

  it('throws readable error when wallet id is missing in subscriptions', async (): Promise<void> => {
    const usersRepositoryStub: UsersRepositoryStub = {
      findOrCreate: vi.fn(),
    };
    const trackedWalletsRepositoryStub: TrackedWalletsRepositoryStub = {
      findOrCreate: vi.fn(),
    };
    const subscriptionsRepositoryStub: SubscriptionsRepositoryStub = {
      addSubscription: vi.fn(),
      listByUserId: vi.fn(),
      removeByWalletId: vi.fn(),
      removeByAddress: vi.fn(),
    };
    const etherscanHistoryServiceStub: EtherscanHistoryServiceStub = {
      loadRecentTransactions: vi.fn(),
    };
    const appConfigServiceStub: AppConfigServiceStub = {
      etherscanTxBaseUrl: 'https://etherscan.io/tx/',
    };
    const userRef: TelegramUserRef = {
      telegramId: '42',
      username: null,
    };
    const userRow: UserRow = {
      id: 7,
      telegram_id: '42',
      username: null,
      created_at: new Date('2026-02-01T00:00:00.000Z'),
    };

    usersRepositoryStub.findOrCreate.mockResolvedValue(userRow);
    subscriptionsRepositoryStub.listByUserId.mockResolvedValue([]);

    const service: TrackingService = new TrackingService(
      usersRepositoryStub as unknown as UsersRepository,
      trackedWalletsRepositoryStub as unknown as TrackedWalletsRepository,
      subscriptionsRepositoryStub as unknown as SubscriptionsRepository,
      etherscanHistoryServiceStub as unknown as EtherscanHistoryService,
      appConfigServiceStub as unknown as AppConfigService,
    );

    await expect(service.getAddressHistory(userRef, '#3', '5')).rejects.toThrow(
      'Не нашел адрес с id #3. Сначала проверь /list.',
    );
  });
});
