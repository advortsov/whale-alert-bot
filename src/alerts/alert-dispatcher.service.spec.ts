import { describe, expect, it, vi } from 'vitest';

import { AlertDispatcherService } from './alert-dispatcher.service';
import type { AlertEnrichmentService } from './alert-enrichment.service';
import type { AlertFilterPolicyService } from './alert-filter-policy.service';
import type { AlertMessageFormatter } from './alert-message.formatter';
import type { AlertSuppressionService } from './alert-suppression.service';
import type { QuietHoursService } from './quiet-hours.service';
import {
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
} from '../chain/chain.types';
import type { AppConfigService } from '../config/app-config.service';
import { ChainKey } from '../core/chains/chain-key.interfaces';
import type { ITokenPricingPort } from '../core/ports/token-pricing/token-pricing.interfaces';
import type { AlertMutesRepository } from '../storage/repositories/alert-mutes.repository';
import type { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import type { UserAlertPreferencesRepository } from '../storage/repositories/user-alert-preferences.repository';
import type { UserAlertSettingsRepository } from '../storage/repositories/user-alert-settings.repository';
import type { UserWalletAlertPreferencesRepository } from '../storage/repositories/user-wallet-alert-preferences.repository';
import type { TelegramSenderService } from '../telegram/telegram-sender.service';

type SubscriptionsRepositoryStub = {
  readonly listSubscriberWalletRecipientsByAddress: ReturnType<typeof vi.fn>;
};

type AlertEnrichmentServiceStub = {
  readonly enrich: ReturnType<typeof vi.fn>;
};

type AlertSuppressionServiceStub = {
  readonly shouldSuppress: ReturnType<typeof vi.fn>;
};

type AlertFilterPolicyServiceStub = {
  readonly evaluateUsdThreshold: ReturnType<typeof vi.fn>;
};

type QuietHoursServiceStub = {
  readonly evaluate: ReturnType<typeof vi.fn>;
};

type AlertMessageFormatterStub = {
  readonly format: ReturnType<typeof vi.fn>;
};

type UserAlertPreferencesRepositoryStub = {
  readonly findOrCreateByUserId: ReturnType<typeof vi.fn>;
};

type UserAlertSettingsRepositoryStub = {
  readonly findOrCreateByUserAndChain: ReturnType<typeof vi.fn>;
};

type UserWalletAlertPreferencesRepositoryStub = {
  readonly findByUserAndWalletId: ReturnType<typeof vi.fn>;
};

type AlertMutesRepositoryStub = {
  readonly findActiveMute: ReturnType<typeof vi.fn>;
};

type TokenPricingPortStub = {
  readonly getUsdQuote: ReturnType<typeof vi.fn>;
};

type TelegramSenderServiceStub = {
  readonly sendText: ReturnType<typeof vi.fn>;
};

type AppConfigServiceStub = {
  readonly etherscanTxBaseUrl: string;
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
  readonly alertFilterPolicyServiceStub: AlertFilterPolicyServiceStub;
  readonly quietHoursServiceStub: QuietHoursServiceStub;
  readonly alertMessageFormatterStub: AlertMessageFormatterStub;
  readonly userAlertPreferencesRepositoryStub: UserAlertPreferencesRepositoryStub;
  readonly userAlertSettingsRepositoryStub: UserAlertSettingsRepositoryStub;
  readonly userWalletAlertPreferencesRepositoryStub: UserWalletAlertPreferencesRepositoryStub;
  readonly alertMutesRepositoryStub: AlertMutesRepositoryStub;
  readonly tokenPricingPortStub: TokenPricingPortStub;
  readonly telegramSenderServiceStub: TelegramSenderServiceStub;
} => {
  const subscriptionsRepositoryStub: SubscriptionsRepositoryStub = {
    listSubscriberWalletRecipientsByAddress: vi.fn(),
  };
  const alertEnrichmentServiceStub: AlertEnrichmentServiceStub = {
    enrich: vi.fn(),
  };
  const alertSuppressionServiceStub: AlertSuppressionServiceStub = {
    shouldSuppress: vi.fn(),
  };
  const alertFilterPolicyServiceStub: AlertFilterPolicyServiceStub = {
    evaluateUsdThreshold: vi.fn(),
  };
  const quietHoursServiceStub: QuietHoursServiceStub = {
    evaluate: vi.fn(),
  };
  const alertMessageFormatterStub: AlertMessageFormatterStub = {
    format: vi.fn(),
  };
  const userAlertPreferencesRepositoryStub: UserAlertPreferencesRepositoryStub = {
    findOrCreateByUserId: vi.fn(),
  };
  const userAlertSettingsRepositoryStub: UserAlertSettingsRepositoryStub = {
    findOrCreateByUserAndChain: vi.fn(),
  };
  const userWalletAlertPreferencesRepositoryStub: UserWalletAlertPreferencesRepositoryStub = {
    findByUserAndWalletId: vi.fn(),
  };
  const alertMutesRepositoryStub: AlertMutesRepositoryStub = {
    findActiveMute: vi.fn(),
  };
  const tokenPricingPortStub: TokenPricingPortStub = {
    getUsdQuote: vi.fn(),
  };
  const telegramSenderServiceStub: TelegramSenderServiceStub = {
    sendText: vi.fn(),
  };
  const appConfigServiceStub: AppConfigServiceStub = {
    etherscanTxBaseUrl: 'https://etherscan.io/tx/',
  };

  subscriptionsRepositoryStub.listSubscriberWalletRecipientsByAddress.mockResolvedValue([
    {
      telegramId: '42',
      userId: 7,
      walletId: 3,
      chainKey: ChainKey.ETHEREUM_MAINNET,
    },
  ]);
  alertSuppressionServiceStub.shouldSuppress.mockReturnValue({
    suppressed: false,
    reason: null,
  });
  alertEnrichmentServiceStub.enrich.mockImplementation(
    (event: ClassifiedEvent): ClassifiedEvent => event,
  );
  alertFilterPolicyServiceStub.evaluateUsdThreshold.mockReturnValue({
    allowed: true,
    suppressedReason: null,
    usdAmount: 120,
    usdUnavailable: false,
  });
  quietHoursServiceStub.evaluate.mockReturnValue({
    suppressed: false,
    currentMinuteOfDay: 100,
  });
  alertMessageFormatterStub.format.mockReturnValue('alert');
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
  userAlertSettingsRepositoryStub.findOrCreateByUserAndChain.mockResolvedValue({
    id: 1,
    user_id: 7,
    chain_key: ChainKey.ETHEREUM_MAINNET,
    threshold_usd: 0,
    min_amount_usd: 0,
    quiet_from: null,
    quiet_to: null,
    timezone: 'UTC',
    updated_at: new Date('2026-02-09T00:00:00.000Z'),
  });
  userWalletAlertPreferencesRepositoryStub.findByUserAndWalletId.mockResolvedValue(null);
  alertMutesRepositoryStub.findActiveMute.mockResolvedValue(null);
  tokenPricingPortStub.getUsdQuote.mockResolvedValue({
    chainKey: ChainKey.ETHEREUM_MAINNET,
    tokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    tokenSymbol: 'USDT',
    usdPrice: 1,
    fetchedAtEpochMs: Date.now(),
    stale: false,
  });

  const service: AlertDispatcherService = new AlertDispatcherService(
    subscriptionsRepositoryStub as unknown as SubscriptionsRepository,
    alertEnrichmentServiceStub as unknown as AlertEnrichmentService,
    alertSuppressionServiceStub as unknown as AlertSuppressionService,
    alertFilterPolicyServiceStub as unknown as AlertFilterPolicyService,
    quietHoursServiceStub as unknown as QuietHoursService,
    alertMessageFormatterStub as unknown as AlertMessageFormatter,
    appConfigServiceStub as unknown as AppConfigService,
    userAlertPreferencesRepositoryStub as unknown as UserAlertPreferencesRepository,
    userAlertSettingsRepositoryStub as unknown as UserAlertSettingsRepository,
    userWalletAlertPreferencesRepositoryStub as unknown as UserWalletAlertPreferencesRepository,
    alertMutesRepositoryStub as unknown as AlertMutesRepository,
    tokenPricingPortStub as unknown as ITokenPricingPort,
    telegramSenderServiceStub as unknown as TelegramSenderService,
  );

  return {
    service,
    subscriptionsRepositoryStub,
    alertEnrichmentServiceStub,
    alertSuppressionServiceStub,
    alertFilterPolicyServiceStub,
    quietHoursServiceStub,
    alertMessageFormatterStub,
    userAlertPreferencesRepositoryStub,
    userAlertSettingsRepositoryStub,
    userWalletAlertPreferencesRepositoryStub,
    alertMutesRepositoryStub,
    tokenPricingPortStub,
    telegramSenderServiceStub,
  };
};

describe('AlertDispatcherService', (): void => {
  it('sends alert with inline actions when user preferences allow event', async (): Promise<void> => {
    const context = createService();

    await context.service.dispatch(buildEvent('12.000000'));

    expect(context.telegramSenderServiceStub.sendText).toHaveBeenCalledWith(
      '42',
      'alert',
      expect.any(Object),
    );
    const sendTextCall = context.telegramSenderServiceStub.sendText.mock.calls[0];
    const sendOptions =
      sendTextCall && sendTextCall.length > 2
        ? (sendTextCall[2] as { readonly reply_markup?: unknown })
        : null;

    expect(sendOptions?.reply_markup).toBeDefined();
  });

  it('skips alert when wallet has active 24h mute', async (): Promise<void> => {
    const context = createService();

    context.alertMutesRepositoryStub.findActiveMute.mockResolvedValue({
      id: 1,
      user_id: 7,
      chain_key: ChainKey.ETHEREUM_MAINNET,
      wallet_id: 3,
      mute_until: new Date(Date.now() + 60_000),
      source: 'alert_button',
      created_at: new Date('2026-02-09T00:00:00.000Z'),
    });

    await context.service.dispatch(buildEvent('12.000000'));

    expect(context.telegramSenderServiceStub.sendText).not.toHaveBeenCalled();
  });

  it('skips alert when quiet-hours suppress delivery', async (): Promise<void> => {
    const context = createService();

    context.quietHoursServiceStub.evaluate.mockReturnValue({
      suppressed: true,
      currentMinuteOfDay: 50,
    });

    await context.service.dispatch(buildEvent('12.000000'));

    expect(context.telegramSenderServiceStub.sendText).not.toHaveBeenCalled();
  });

  it('skips alert when usd threshold policy rejects event', async (): Promise<void> => {
    const context = createService();

    context.userAlertSettingsRepositoryStub.findOrCreateByUserAndChain.mockResolvedValue({
      id: 1,
      user_id: 7,
      chain_key: ChainKey.ETHEREUM_MAINNET,
      threshold_usd: 1000,
      min_amount_usd: 0,
      quiet_from: null,
      quiet_to: null,
      timezone: 'UTC',
      updated_at: new Date('2026-02-09T00:00:00.000Z'),
    });
    context.alertFilterPolicyServiceStub.evaluateUsdThreshold.mockReturnValue({
      allowed: false,
      suppressedReason: 'threshold_usd',
      usdAmount: 12,
      usdUnavailable: false,
    });

    await context.service.dispatch(buildEvent('12.000000'));

    expect(context.telegramSenderServiceStub.sendText).not.toHaveBeenCalled();
  });
});
