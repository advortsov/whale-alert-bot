import { describe, expect, it, vi } from 'vitest';

import { AlertDispatcherService } from './alert-dispatcher.service';
import type { AlertEnrichmentService } from './alert-enrichment.service';
import type { AlertMessageFormatter } from './alert-message.formatter';
import type { AlertSuppressionService } from './alert-suppression.service';
import {
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
} from '../chain/chain.types';
import type { UserRow } from '../storage/database.types';
import type { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import type { UserAlertPreferencesRepository } from '../storage/repositories/user-alert-preferences.repository';
import type { UsersRepository } from '../storage/repositories/users.repository';
import type { TelegramSenderService } from '../telegram/telegram-sender.service';

type SubscriptionsRepositoryStub = {
  readonly getSubscriberTelegramIdsByAddress: ReturnType<typeof vi.fn>;
};

type AlertEnrichmentServiceStub = {
  readonly enrich: ReturnType<typeof vi.fn>;
};

type AlertSuppressionServiceStub = {
  readonly shouldSuppress: ReturnType<typeof vi.fn>;
};

type AlertMessageFormatterStub = {
  readonly format: ReturnType<typeof vi.fn>;
};

type UsersRepositoryStub = {
  readonly findByTelegramId: ReturnType<typeof vi.fn>;
};

type UserAlertPreferencesRepositoryStub = {
  readonly findOrCreateByUserId: ReturnType<typeof vi.fn>;
};

type TelegramSenderServiceStub = {
  readonly sendText: ReturnType<typeof vi.fn>;
};

const buildEvent = (valueFormatted: string): ClassifiedEvent => {
  return {
    chainId: ChainId.ETHEREUM_MAINNET,
    txHash: '0xtx',
    logIndex: 1,
    trackedAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    eventType: ClassifiedEventType.TRANSFER,
    direction: EventDirection.IN,
    contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    tokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    tokenSymbol: 'USDT',
    tokenDecimals: 6,
    tokenAmountRaw: '12345000',
    valueFormatted,
    dex: null,
    pair: null,
  };
};

const createService = (): {
  readonly service: AlertDispatcherService;
  readonly subscriptionsRepositoryStub: SubscriptionsRepositoryStub;
  readonly alertEnrichmentServiceStub: AlertEnrichmentServiceStub;
  readonly alertSuppressionServiceStub: AlertSuppressionServiceStub;
  readonly alertMessageFormatterStub: AlertMessageFormatterStub;
  readonly usersRepositoryStub: UsersRepositoryStub;
  readonly userAlertPreferencesRepositoryStub: UserAlertPreferencesRepositoryStub;
  readonly telegramSenderServiceStub: TelegramSenderServiceStub;
} => {
  const subscriptionsRepositoryStub: SubscriptionsRepositoryStub = {
    getSubscriberTelegramIdsByAddress: vi.fn(),
  };
  const alertEnrichmentServiceStub: AlertEnrichmentServiceStub = {
    enrich: vi.fn(),
  };
  const alertSuppressionServiceStub: AlertSuppressionServiceStub = {
    shouldSuppress: vi.fn(),
  };
  const alertMessageFormatterStub: AlertMessageFormatterStub = {
    format: vi.fn(),
  };
  const usersRepositoryStub: UsersRepositoryStub = {
    findByTelegramId: vi.fn(),
  };
  const userAlertPreferencesRepositoryStub: UserAlertPreferencesRepositoryStub = {
    findOrCreateByUserId: vi.fn(),
  };
  const telegramSenderServiceStub: TelegramSenderServiceStub = {
    sendText: vi.fn(),
  };

  subscriptionsRepositoryStub.getSubscriberTelegramIdsByAddress.mockResolvedValue(['42']);
  alertSuppressionServiceStub.shouldSuppress.mockReturnValue({
    suppressed: false,
    reason: null,
  });
  alertEnrichmentServiceStub.enrich.mockImplementation(
    (event: ClassifiedEvent): ClassifiedEvent => event,
  );
  alertMessageFormatterStub.format.mockReturnValue('alert');
  const userRow: UserRow = {
    id: 7,
    telegram_id: '42',
    username: 'tester',
    created_at: new Date('2026-02-09T00:00:00.000Z'),
  };
  usersRepositoryStub.findByTelegramId.mockResolvedValue(userRow);
  userAlertPreferencesRepositoryStub.findOrCreateByUserId.mockResolvedValue({
    id: 1,
    user_id: 7,
    min_amount: 0,
    allow_transfer: true,
    allow_swap: true,
    muted_until: null,
    created_at: new Date('2026-02-09T00:00:00.000Z'),
    updated_at: new Date('2026-02-09T00:00:00.000Z'),
  });

  const service: AlertDispatcherService = new AlertDispatcherService(
    subscriptionsRepositoryStub as unknown as SubscriptionsRepository,
    alertEnrichmentServiceStub as unknown as AlertEnrichmentService,
    alertSuppressionServiceStub as unknown as AlertSuppressionService,
    alertMessageFormatterStub as unknown as AlertMessageFormatter,
    usersRepositoryStub as unknown as UsersRepository,
    userAlertPreferencesRepositoryStub as unknown as UserAlertPreferencesRepository,
    telegramSenderServiceStub as unknown as TelegramSenderService,
  );

  return {
    service,
    subscriptionsRepositoryStub,
    alertEnrichmentServiceStub,
    alertSuppressionServiceStub,
    alertMessageFormatterStub,
    usersRepositoryStub,
    userAlertPreferencesRepositoryStub,
    telegramSenderServiceStub,
  };
};

describe('AlertDispatcherService', (): void => {
  it('sends alert when user preferences allow event', async (): Promise<void> => {
    const context = createService();

    await context.service.dispatch(buildEvent('12.000000'));

    expect(context.telegramSenderServiceStub.sendText).toHaveBeenCalledWith('42', 'alert');
  });

  it('skips alert when user is muted', async (): Promise<void> => {
    const context = createService();

    context.userAlertPreferencesRepositoryStub.findOrCreateByUserId.mockResolvedValue({
      id: 1,
      user_id: 7,
      min_amount: 0,
      allow_transfer: true,
      allow_swap: true,
      muted_until: new Date(Date.now() + 60_000),
      created_at: new Date('2026-02-09T00:00:00.000Z'),
      updated_at: new Date('2026-02-09T00:00:00.000Z'),
    });

    await context.service.dispatch(buildEvent('12.000000'));

    expect(context.telegramSenderServiceStub.sendText).not.toHaveBeenCalled();
  });

  it('skips alert when event value is below user min amount', async (): Promise<void> => {
    const context = createService();

    context.userAlertPreferencesRepositoryStub.findOrCreateByUserId.mockResolvedValue({
      id: 1,
      user_id: 7,
      min_amount: 100,
      allow_transfer: true,
      allow_swap: true,
      muted_until: null,
      created_at: new Date('2026-02-09T00:00:00.000Z'),
      updated_at: new Date('2026-02-09T00:00:00.000Z'),
    });

    await context.service.dispatch(buildEvent('12.000000'));

    expect(context.telegramSenderServiceStub.sendText).not.toHaveBeenCalled();
  });
});
