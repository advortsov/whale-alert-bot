import { Inject, Injectable, Logger } from '@nestjs/common';

import { AlertEnrichmentService } from './alert-enrichment.service';
import { AlertFilterPolicyService } from './alert-filter-policy.service';
import { AlertMessageFormatter } from './alert-message.formatter';
import { AlertSuppressionService } from './alert-suppression.service';
import { type AlertMessageContext } from './alert.interfaces';
import { CexAddressBookService } from './cex-address-book.service';
import { QuietHoursService } from './quiet-hours.service';
import { ClassifiedEventType, type ClassifiedEvent } from '../chain/chain.types';
import { AppConfigService } from '../config/app-config.service';
import { ChainKey } from '../core/chains/chain-key.interfaces';
import { TOKEN_PRICING_PORT } from '../core/ports/token-pricing/token-pricing-port.tokens';
import type { ITokenPricingPort } from '../core/ports/token-pricing/token-pricing.interfaces';
import type { AlertFilterPolicy } from '../features/alerts/alert-filter.interfaces';
import { AlertCexFlowMode, type AlertCexFlowPolicy } from '../features/alerts/cex-flow.interfaces';
import {
  AlertSmartFilterType,
  type AlertSemanticFilterPolicy,
} from '../features/alerts/smart-filter.interfaces';
import { AlertMutesRepository } from '../storage/repositories/alert-mutes.repository';
import { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import type { SubscriberWalletRecipient } from '../storage/repositories/subscriptions.repository.interfaces';
import { UserAlertPreferencesRepository } from '../storage/repositories/user-alert-preferences.repository';
import { UserAlertSettingsRepository } from '../storage/repositories/user-alert-settings.repository';
import { UserWalletAlertPreferencesRepository } from '../storage/repositories/user-wallet-alert-preferences.repository';
import type { TelegramSendTextOptions } from '../telegram/telegram-sender.service';
import { TelegramSenderService } from '../telegram/telegram-sender.service';

interface EventUsdContext {
  readonly usdAmount: number | null;
  readonly usdUnavailable: boolean;
}

interface DispatchDecision {
  readonly skip: boolean;
  readonly reason: string | null;
  readonly messageContext: AlertMessageContext;
}

@Injectable()
export class AlertDispatcherService {
  private readonly logger: Logger = new Logger(AlertDispatcherService.name);

  public constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly alertEnrichmentService: AlertEnrichmentService,
    private readonly alertSuppressionService: AlertSuppressionService,
    private readonly alertFilterPolicyService: AlertFilterPolicyService,
    private readonly cexAddressBookService: CexAddressBookService,
    private readonly quietHoursService: QuietHoursService,
    private readonly alertMessageFormatter: AlertMessageFormatter,
    private readonly appConfigService: AppConfigService,
    private readonly userAlertPreferencesRepository: UserAlertPreferencesRepository,
    private readonly userAlertSettingsRepository: UserAlertSettingsRepository,
    private readonly userWalletAlertPreferencesRepository: UserWalletAlertPreferencesRepository,
    private readonly alertMutesRepository: AlertMutesRepository,
    @Inject(TOKEN_PRICING_PORT)
    private readonly tokenPricingPort: ITokenPricingPort,
    private readonly telegramSenderService: TelegramSenderService,
  ) {}

  public async dispatch(event: ClassifiedEvent): Promise<void> {
    this.logger.debug(
      `dispatch start eventType=${event.eventType} trackedAddress=${event.trackedAddress} txHash=${event.txHash}`,
    );
    const chainKey: ChainKey = this.resolveChainKey(event.chainId);
    const subscribers: readonly SubscriberWalletRecipient[] =
      await this.subscriptionsRepository.listSubscriberWalletRecipientsByAddress(
        chainKey,
        event.trackedAddress,
      );

    if (subscribers.length === 0) {
      this.logger.debug(
        `dispatch skipped no subscribers trackedAddress=${event.trackedAddress} txHash=${event.txHash}`,
      );
      return;
    }

    const suppressionDecision = this.alertSuppressionService.shouldSuppress(event);

    if (suppressionDecision.suppressed) {
      this.logger.debug(
        `dispatch suppressed eventType=${event.eventType} trackedAddress=${event.trackedAddress} txHash=${event.txHash} reason=${suppressionDecision.reason ?? 'n/a'}`,
      );
      return;
    }

    const enrichedEvent: ClassifiedEvent = this.alertEnrichmentService.enrich(event);
    const eventUsdContext: EventUsdContext = await this.resolveUsdContext(enrichedEvent, chainKey);

    this.logger.log(
      `dispatch sending eventType=${event.eventType} recipients=${subscribers.length} txHash=${event.txHash}`,
    );

    let successfulDeliveries: number = 0;

    for (const subscriber of subscribers) {
      const decision: DispatchDecision = await this.evaluateRecipient(
        subscriber,
        enrichedEvent,
        chainKey,
        eventUsdContext,
      );

      if (decision.skip) {
        this.logger.debug(
          `dispatch skipped by user policy telegramId=${subscriber.telegramId} walletId=${String(subscriber.walletId)} txHash=${event.txHash} reason=${decision.reason ?? 'n/a'}`,
        );
        continue;
      }

      const message: string = this.alertMessageFormatter.format(
        enrichedEvent,
        decision.messageContext,
      );
      const sendOptions: TelegramSendTextOptions = this.buildAlertInlineKeyboard(
        subscriber.walletId,
        enrichedEvent,
      );

      try {
        await this.telegramSenderService.sendText(subscriber.telegramId, message, sendOptions);
        successfulDeliveries += 1;
      } catch (error: unknown) {
        const errorMessage: string = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `dispatch delivery failed telegramId=${subscriber.telegramId} walletId=${String(subscriber.walletId)} txHash=${event.txHash} reason=${errorMessage}`,
        );
      }
    }

    this.logger.debug(
      `dispatch complete txHash=${event.txHash} successful=${successfulDeliveries} failed=${subscribers.length - successfulDeliveries}`,
    );
  }

  private async evaluateRecipient(
    subscriber: SubscriberWalletRecipient,
    event: ClassifiedEvent,
    chainKey: ChainKey,
    eventUsdContext: EventUsdContext,
  ): Promise<DispatchDecision> {
    const recipientChainKey: ChainKey = subscriber.chainKey;
    const [preferences, settings, walletPreferences, activeMute] = await Promise.all([
      this.userAlertPreferencesRepository.findOrCreateByUserId(subscriber.userId),
      this.userAlertSettingsRepository.findOrCreateByUserAndChain(
        subscriber.userId,
        recipientChainKey,
      ),
      this.userWalletAlertPreferencesRepository.findByUserAndWalletId(
        subscriber.userId,
        subscriber.walletId,
      ),
      this.alertMutesRepository.findActiveMute(
        subscriber.userId,
        recipientChainKey,
        subscriber.walletId,
      ),
    ]);

    if (activeMute !== null) {
      return {
        skip: true,
        reason: 'wallet_muted_24h',
        messageContext: {
          usdAmount: null,
          usdUnavailable: false,
        },
      };
    }

    if (preferences.muted_until !== null && preferences.muted_until.getTime() > Date.now()) {
      return {
        skip: true,
        reason: 'global_mute',
        messageContext: {
          usdAmount: null,
          usdUnavailable: false,
        },
      };
    }

    const quietEvaluation = this.quietHoursService.evaluate(
      settings.quiet_from,
      settings.quiet_to,
      settings.timezone,
    );

    if (quietEvaluation.suppressed) {
      this.logger.debug(
        `alert_suppressed_quiet_hours telegramId=${subscriber.telegramId} walletId=${String(subscriber.walletId)} chainKey=${chainKey} timezone=${settings.timezone}`,
      );
      return {
        skip: true,
        reason: 'quiet_hours',
        messageContext: {
          usdAmount: null,
          usdUnavailable: false,
        },
      };
    }

    const allowTransfer: boolean = walletPreferences
      ? walletPreferences.allow_transfer
      : preferences.allow_transfer;
    const allowSwap: boolean = walletPreferences
      ? walletPreferences.allow_swap
      : preferences.allow_swap;

    if (event.eventType === ClassifiedEventType.TRANSFER && !allowTransfer) {
      return {
        skip: true,
        reason: 'transfer_disabled',
        messageContext: {
          usdAmount: null,
          usdUnavailable: false,
        },
      };
    }

    if (event.eventType === ClassifiedEventType.SWAP && !allowSwap) {
      return {
        skip: true,
        reason: 'swap_disabled',
        messageContext: {
          usdAmount: null,
          usdUnavailable: false,
        },
      };
    }

    const legacyMinAmount: number = Number.parseFloat(String(preferences.min_amount));

    if (legacyMinAmount > 0) {
      const value: number | null = event.valueFormatted
        ? Number.parseFloat(event.valueFormatted)
        : null;

      if (value === null || Number.isNaN(value) || value < legacyMinAmount) {
        return {
          skip: true,
          reason: 'legacy_min_amount',
          messageContext: {
            usdAmount: null,
            usdUnavailable: false,
          },
        };
      }
    }

    const parsedThreshold: number = Number.parseFloat(String(settings.threshold_usd));
    const parsedMinAmount: number = Number.parseFloat(String(settings.min_amount_usd));
    const policy: AlertFilterPolicy = {
      thresholdUsd: Number.isNaN(parsedThreshold) ? 0 : parsedThreshold,
      minAmountUsd: Number.isNaN(parsedMinAmount) ? 0 : parsedMinAmount,
    };
    const thresholdDecision = this.alertFilterPolicyService.evaluateUsdThreshold(
      policy,
      eventUsdContext.usdAmount,
      eventUsdContext.usdUnavailable,
    );

    if (!thresholdDecision.allowed) {
      return {
        skip: true,
        reason: thresholdDecision.suppressedReason,
        messageContext: {
          usdAmount: thresholdDecision.usdAmount,
          usdUnavailable: false,
        },
      };
    }

    const usdWarningEnabled: boolean =
      thresholdDecision.usdUnavailable && (policy.thresholdUsd > 0 || policy.minAmountUsd > 0);
    const semanticPolicy: AlertSemanticFilterPolicy = this.mapSemanticPolicy(settings);
    const semanticDecision = this.alertFilterPolicyService.evaluateSemanticFilters(semanticPolicy, {
      eventType: event.eventType,
      direction: event.direction,
      dex: event.dex,
    });

    if (!semanticDecision.allowed) {
      return {
        skip: true,
        reason: semanticDecision.suppressedReason,
        messageContext: {
          usdAmount: thresholdDecision.usdAmount,
          usdUnavailable: usdWarningEnabled,
        },
      };
    }

    const cexPolicy: AlertCexFlowPolicy = this.mapCexFlowPolicy(settings);
    const counterpartyTag: string | null = this.cexAddressBookService.resolveTag(
      recipientChainKey,
      event.counterpartyAddress,
    );
    const cexDecision = this.alertFilterPolicyService.evaluateCexFlow(cexPolicy, {
      eventType: event.eventType,
      direction: event.direction,
      counterpartyTag,
    });

    if (!cexDecision.allowed) {
      return {
        skip: true,
        reason: cexDecision.suppressedReason,
        messageContext: {
          usdAmount: thresholdDecision.usdAmount,
          usdUnavailable: usdWarningEnabled,
        },
      };
    }

    return {
      skip: false,
      reason: null,
      messageContext: {
        usdAmount: thresholdDecision.usdAmount,
        usdUnavailable: usdWarningEnabled,
      },
    };
  }

  private mapSemanticPolicy(settings: {
    readonly smart_filter_type?: string | null;
    readonly include_dexes?: readonly string[] | null;
    readonly exclude_dexes?: readonly string[] | null;
  }): AlertSemanticFilterPolicy {
    const smartFilterType: AlertSmartFilterType = this.parseSmartFilterType(
      settings.smart_filter_type,
    );

    return {
      type: smartFilterType,
      includeDexes: this.normalizeDexList(settings.include_dexes),
      excludeDexes: this.normalizeDexList(settings.exclude_dexes),
    };
  }

  private mapCexFlowPolicy(settings: {
    readonly cex_flow_mode?: string | null;
  }): AlertCexFlowPolicy {
    return {
      mode: this.parseCexFlowMode(settings.cex_flow_mode),
    };
  }

  private parseSmartFilterType(rawValue: string | null | undefined): AlertSmartFilterType {
    if (rawValue === null || rawValue === undefined) {
      return AlertSmartFilterType.ALL;
    }

    const normalizedValue: string = rawValue.trim().toLowerCase();

    if (normalizedValue === 'buy') {
      return AlertSmartFilterType.BUY;
    }

    if (normalizedValue === 'sell') {
      return AlertSmartFilterType.SELL;
    }

    if (normalizedValue === 'transfer') {
      return AlertSmartFilterType.TRANSFER;
    }

    return AlertSmartFilterType.ALL;
  }

  private parseCexFlowMode(rawValue: string | null | undefined): AlertCexFlowMode {
    if (rawValue === null || rawValue === undefined) {
      return AlertCexFlowMode.OFF;
    }

    const normalizedValue: string = rawValue.trim().toLowerCase();

    if (normalizedValue === 'in') {
      return AlertCexFlowMode.IN;
    }

    if (normalizedValue === 'out') {
      return AlertCexFlowMode.OUT;
    }

    if (normalizedValue === 'all') {
      return AlertCexFlowMode.ALL;
    }

    return AlertCexFlowMode.OFF;
  }

  private normalizeDexList(rawList: readonly string[] | null | undefined): readonly string[] {
    if (!rawList || rawList.length === 0) {
      return [];
    }

    const normalizedList: string[] = [];

    for (const item of rawList) {
      const normalizedItem: string = item.trim().toLowerCase();

      if (normalizedItem.length === 0) {
        continue;
      }

      if (!normalizedList.includes(normalizedItem)) {
        normalizedList.push(normalizedItem);
      }
    }

    return normalizedList;
  }

  private async resolveUsdContext(
    event: ClassifiedEvent,
    chainKey: ChainKey,
  ): Promise<EventUsdContext> {
    const value: number | null = event.valueFormatted
      ? Number.parseFloat(event.valueFormatted)
      : null;

    if (value === null || Number.isNaN(value) || value <= 0) {
      return {
        usdAmount: null,
        usdUnavailable: true,
      };
    }

    const quote = await this.tokenPricingPort.getUsdQuote({
      chainKey,
      tokenAddress: event.tokenAddress,
      tokenSymbol: event.tokenSymbol,
    });

    if (quote === null || !Number.isFinite(quote.usdPrice) || quote.usdPrice <= 0) {
      return {
        usdAmount: null,
        usdUnavailable: true,
      };
    }

    return {
      usdAmount: value * quote.usdPrice,
      usdUnavailable: false,
    };
  }

  private buildAlertInlineKeyboard(
    walletId: number,
    event: ClassifiedEvent,
  ): TelegramSendTextOptions {
    const txUrl: string = `${this.appConfigService.etherscanTxBaseUrl}${event.txHash}`;
    const chartUrl: string = this.buildChartUrl(event);
    const portfolioUrl: string = `https://debank.com/profile/${event.trackedAddress}`;

    return {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📊 Chart',
              url: chartUrl,
            },
            {
              text: '🔍 Etherscan',
              url: txUrl,
            },
          ],
          [
            {
              text: '💼 Wallet',
              callback_data: `wallet_menu:${String(walletId)}`,
            },
            {
              text: '🚫 Ignore 24h',
              callback_data: `alert_ignore_24h:${String(walletId)}`,
            },
          ],
          [
            {
              text: '🧾 Portfolio',
              url: portfolioUrl,
            },
          ],
        ],
      },
      link_preview_options: {
        is_disabled: true,
      },
    };
  }

  private buildChartUrl(event: ClassifiedEvent): string {
    if (event.tokenAddress !== null && event.tokenAddress.length > 0) {
      return `https://dexscreener.com/ethereum/${event.tokenAddress}`;
    }

    return 'https://www.tradingview.com/symbols/ETHUSD/';
  }

  private resolveChainKey(chainId: number): ChainKey {
    if (chainId === 1) {
      return ChainKey.ETHEREUM_MAINNET;
    }

    if (chainId === 101) {
      return ChainKey.SOLANA_MAINNET;
    }

    return ChainKey.ETHEREUM_MAINNET;
  }
}
