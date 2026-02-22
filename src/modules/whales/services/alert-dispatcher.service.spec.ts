import { describe, expect, it, vi } from 'vitest';

import { AlertDispatcherDependencies, AlertDispatcherService } from './alert-dispatcher.service';
import type { AlertEnrichmentService } from './alert-enrichment.service';
import type { AlertFilterPolicyService } from './alert-filter-policy.service';
import type { AlertMessageFormatter } from './alert-message.formatter';
import {
  AlertRecipientEvaluatorDependencies,
  AlertRecipientEvaluatorService,
} from './alert-recipient-evaluator.service';
import type { AlertSuppressionService } from './alert-suppression.service';
import type { CexAddressBookService } from './cex-address-book.service';
import type { QuietHoursService } from './quiet-hours.service';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import {
  AssetStandard,
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
} from '../../../common/interfaces/chain.types';
import type { ITokenPricingPort } from '../../../common/interfaces/token-pricing/token-pricing.interfaces';
import type { AppConfigService } from '../../../config/app-config.service';
import type { AlertMutesRepository } from '../../../database/repositories/alert-mutes.repository';
import type { SubscriptionsRepository } from '../../../database/repositories/subscriptions.repository';
import type { UserAlertPreferencesRepository } from '../../../database/repositories/user-alert-preferences.repository';
import type { UserAlertSettingsRepository } from '../../../database/repositories/user-alert-settings.repository';
import type { UserWalletAlertPreferencesRepository } from '../../../database/repositories/user-wallet-alert-preferences.repository';
import type { TelegramSenderService } from '../../telegram/bot/telegram-sender.service';

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
  readonly evaluateSemanticFilters: ReturnType<typeof vi.fn>;
  readonly evaluateCexFlow: ReturnType<typeof vi.fn>;
};

type QuietHoursServiceStub = {
  readonly evaluate: ReturnType<typeof vi.fn>;
};

type CexAddressBookServiceStub = {
  readonly resolveTag: ReturnType<typeof vi.fn>;
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
  readonly tmaBotUsername: string;
};

const buildEvent = (valueFormatted: string): ClassifiedEvent => {
  return {
    chainId: ChainId.ETHEREUM_MAINNET,
    txHash: '0xtx',
    logIndex: 1,
    trackedAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    eventType: ClassifiedEventType.TRANSFER,
    direction: EventDirection.IN,
    assetStandard: AssetStandard.ERC20,
    contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    tokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    tokenSymbol: 'USDT',
    tokenDecimals: 6,
    tokenAmountRaw: '12345000',
    valueFormatted,
    counterpartyAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
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
  readonly cexAddressBookServiceStub: CexAddressBookServiceStub;
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
    evaluateSemanticFilters: vi.fn(),
    evaluateCexFlow: vi.fn(),
  };
  const quietHoursServiceStub: QuietHoursServiceStub = {
    evaluate: vi.fn(),
  };
  const cexAddressBookServiceStub: CexAddressBookServiceStub = {
    resolveTag: vi.fn(),
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
    tmaBotUsername: 'whale_alert_test_bot',
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
  alertFilterPolicyServiceStub.evaluateSemanticFilters.mockReturnValue({
    allowed: true,
    suppressedReason: null,
    normalizedDex: null,
  });
  alertFilterPolicyServiceStub.evaluateCexFlow.mockReturnValue({
    allowed: true,
    suppressedReason: null,
  });
  quietHoursServiceStub.evaluate.mockReturnValue({
    suppressed: false,
    currentMinuteOfDay: 100,
  });
  cexAddressBookServiceStub.resolveTag.mockReturnValue(null);
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
    cex_flow_mode: 'off',
    smart_filter_type: 'all',
    include_dexes: [],
    exclude_dexes: [],
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

  const dependencies: AlertDispatcherDependencies = new AlertDispatcherDependencies();
  (dependencies as { subscriptionsRepository: SubscriptionsRepository }).subscriptionsRepository =
    subscriptionsRepositoryStub as unknown as SubscriptionsRepository;
  (dependencies as { alertEnrichmentService: AlertEnrichmentService }).alertEnrichmentService =
    alertEnrichmentServiceStub as unknown as AlertEnrichmentService;
  (dependencies as { alertSuppressionService: AlertSuppressionService }).alertSuppressionService =
    alertSuppressionServiceStub as unknown as AlertSuppressionService;
  (dependencies as { appConfigService: AppConfigService }).appConfigService =
    appConfigServiceStub as unknown as AppConfigService;
  (dependencies as { tokenPricingPort: ITokenPricingPort }).tokenPricingPort =
    tokenPricingPortStub as unknown as ITokenPricingPort;
  (dependencies as { alertMessageFormatter: AlertMessageFormatter }).alertMessageFormatter =
    alertMessageFormatterStub as unknown as AlertMessageFormatter;
  (dependencies as { telegramSenderService: TelegramSenderService }).telegramSenderService =
    telegramSenderServiceStub as unknown as TelegramSenderService;
  const recipientEvaluatorDependencies: AlertRecipientEvaluatorDependencies =
    new AlertRecipientEvaluatorDependencies();
  (
    recipientEvaluatorDependencies as {
      userAlertPreferencesRepository: UserAlertPreferencesRepository;
    }
  ).userAlertPreferencesRepository =
    userAlertPreferencesRepositoryStub as unknown as UserAlertPreferencesRepository;
  (
    recipientEvaluatorDependencies as {
      userAlertSettingsRepository: UserAlertSettingsRepository;
    }
  ).userAlertSettingsRepository =
    userAlertSettingsRepositoryStub as unknown as UserAlertSettingsRepository;
  (
    recipientEvaluatorDependencies as {
      userWalletAlertPreferencesRepository: UserWalletAlertPreferencesRepository;
    }
  ).userWalletAlertPreferencesRepository =
    userWalletAlertPreferencesRepositoryStub as unknown as UserWalletAlertPreferencesRepository;
  (
    recipientEvaluatorDependencies as { alertMutesRepository: AlertMutesRepository }
  ).alertMutesRepository = alertMutesRepositoryStub as unknown as AlertMutesRepository;
  (recipientEvaluatorDependencies as { quietHoursService: QuietHoursService }).quietHoursService =
    quietHoursServiceStub as unknown as QuietHoursService;
  (
    recipientEvaluatorDependencies as {
      alertFilterPolicyService: AlertFilterPolicyService;
    }
  ).alertFilterPolicyService = alertFilterPolicyServiceStub as unknown as AlertFilterPolicyService;
  (
    recipientEvaluatorDependencies as { cexAddressBookService: CexAddressBookService }
  ).cexAddressBookService = cexAddressBookServiceStub as unknown as CexAddressBookService;
  const recipientEvaluatorService: AlertRecipientEvaluatorService =
    new AlertRecipientEvaluatorService(recipientEvaluatorDependencies);
  (
    dependencies as { recipientEvaluatorService: AlertRecipientEvaluatorService }
  ).recipientEvaluatorService = recipientEvaluatorService;

  const service: AlertDispatcherService = new AlertDispatcherService(dependencies);

  return {
    service,
    subscriptionsRepositoryStub,
    alertEnrichmentServiceStub,
    alertSuppressionServiceStub,
    alertFilterPolicyServiceStub,
    quietHoursServiceStub,
    cexAddressBookServiceStub,
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
        ? (sendTextCall[2] as {
            readonly reply_markup?: {
              readonly inline_keyboard?: readonly (readonly { readonly url?: string }[])[];
            };
          })
        : null;

    expect(sendOptions?.reply_markup).toBeDefined();
    const hasTmaButton: boolean =
      sendOptions?.reply_markup?.inline_keyboard?.some((row) =>
        row.some((button) => button.url === 'https://t.me/whale_alert_test_bot?startapp=wallet_3'),
      ) ?? false;
    expect(hasTmaButton).toBe(true);
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
      cex_flow_mode: 'off',
      smart_filter_type: 'all',
      include_dexes: [],
      exclude_dexes: [],
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

  it('skips alert when smart type filter expects buy but event is transfer', async (): Promise<void> => {
    const context = createService();
    context.alertFilterPolicyServiceStub.evaluateSemanticFilters.mockReturnValue({
      allowed: false,
      suppressedReason: 'type_filter',
      normalizedDex: null,
    });

    context.userAlertSettingsRepositoryStub.findOrCreateByUserAndChain.mockResolvedValue({
      id: 1,
      user_id: 7,
      chain_key: ChainKey.ETHEREUM_MAINNET,
      threshold_usd: 0,
      min_amount_usd: 0,
      cex_flow_mode: 'off',
      smart_filter_type: 'buy',
      include_dexes: [],
      exclude_dexes: [],
      quiet_from: null,
      quiet_to: null,
      timezone: 'UTC',
      updated_at: new Date('2026-02-09T00:00:00.000Z'),
    });

    await context.service.dispatch(buildEvent('12.000000'));

    expect(context.telegramSenderServiceStub.sendText).not.toHaveBeenCalled();
  });

  it('skips swap alert when dex is excluded', async (): Promise<void> => {
    const context = createService();
    context.alertFilterPolicyServiceStub.evaluateSemanticFilters.mockReturnValue({
      allowed: false,
      suppressedReason: 'dex_exclude',
      normalizedDex: 'uniswap',
    });
    const swapEvent: ClassifiedEvent = {
      ...buildEvent('12.000000'),
      eventType: ClassifiedEventType.SWAP,
      direction: EventDirection.OUT,
      dex: 'Uniswap V3',
    };

    context.userAlertSettingsRepositoryStub.findOrCreateByUserAndChain.mockResolvedValue({
      id: 1,
      user_id: 7,
      chain_key: ChainKey.ETHEREUM_MAINNET,
      threshold_usd: 0,
      min_amount_usd: 0,
      cex_flow_mode: 'off',
      smart_filter_type: 'all',
      include_dexes: [],
      exclude_dexes: ['uniswap'],
      quiet_from: null,
      quiet_to: null,
      timezone: 'UTC',
      updated_at: new Date('2026-02-09T00:00:00.000Z'),
    });

    await context.service.dispatch(swapEvent);

    expect(context.telegramSenderServiceStub.sendText).not.toHaveBeenCalled();
  });

  it('skips transfer alert when cex flow mode is out and counterparty is not cex', async (): Promise<void> => {
    const context = createService();

    context.userAlertSettingsRepositoryStub.findOrCreateByUserAndChain.mockResolvedValue({
      id: 1,
      user_id: 7,
      chain_key: ChainKey.ETHEREUM_MAINNET,
      threshold_usd: 0,
      min_amount_usd: 0,
      cex_flow_mode: 'out',
      smart_filter_type: 'all',
      include_dexes: [],
      exclude_dexes: [],
      quiet_from: null,
      quiet_to: null,
      timezone: 'UTC',
      updated_at: new Date('2026-02-09T00:00:00.000Z'),
    });
    context.cexAddressBookServiceStub.resolveTag.mockReturnValue(null);
    context.alertFilterPolicyServiceStub.evaluateCexFlow.mockReturnValue({
      allowed: false,
      suppressedReason: 'cex_not_matched',
    });

    await context.service.dispatch(buildEvent('12.000000'));

    expect(context.telegramSenderServiceStub.sendText).not.toHaveBeenCalled();
  });
});
