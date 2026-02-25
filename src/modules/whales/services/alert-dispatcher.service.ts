import { Inject, Injectable, Logger } from '@nestjs/common';
import type { InlineKeyboardButton } from 'telegraf/types';

import { AlertEnrichmentService } from './alert-enrichment.service';
import { AlertMessageFormatter } from './alert-message.formatter';
import { AlertRecipientEvaluatorService } from './alert-recipient-evaluator.service';
import { AlertSuppressionService } from './alert-suppression.service';
import type { IAlertDispatcher } from '../../../common/interfaces/alerts/alert-dispatcher.interfaces';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import { ChainId, type ClassifiedEvent } from '../../../common/interfaces/chain.types';
import { TOKEN_PRICING_PORT } from '../../../common/interfaces/token-pricing/token-pricing-port.tokens';
import type { ITokenPricingPort } from '../../../common/interfaces/token-pricing/token-pricing.interfaces';
import { AppConfigService } from '../../../config/app-config.service';
import { SubscriptionsRepository } from '../../../database/repositories/subscriptions.repository';
import type { SubscriberWalletRecipient } from '../../../database/repositories/subscriptions.repository.interfaces';
import type { TelegramSendTextOptions } from '../../telegram/bot/telegram-sender.service';
import { TelegramSenderService } from '../../telegram/bot/telegram-sender.service';
import type { IDispatchDecision, IEventUsdContext } from '../entities/alert-dispatcher.interfaces';

@Injectable()
export class AlertDispatcherDependencies {
  @Inject(SubscriptionsRepository)
  public readonly subscriptionsRepository!: SubscriptionsRepository;

  @Inject(AlertEnrichmentService)
  public readonly alertEnrichmentService!: AlertEnrichmentService;

  @Inject(AlertSuppressionService)
  public readonly alertSuppressionService!: AlertSuppressionService;

  @Inject(AppConfigService)
  public readonly appConfigService!: AppConfigService;

  @Inject(TOKEN_PRICING_PORT)
  public readonly tokenPricingPort!: ITokenPricingPort;

  @Inject(AlertMessageFormatter)
  public readonly alertMessageFormatter!: AlertMessageFormatter;

  @Inject(TelegramSenderService)
  public readonly telegramSenderService!: TelegramSenderService;

  @Inject(AlertRecipientEvaluatorService)
  public readonly recipientEvaluatorService!: AlertRecipientEvaluatorService;
}

@Injectable()
export class AlertDispatcherService implements IAlertDispatcher {
  private readonly logger: Logger = new Logger(AlertDispatcherService.name);
  private readonly subscriptionsRepository: SubscriptionsRepository;
  private readonly alertEnrichmentService: AlertEnrichmentService;
  private readonly alertSuppressionService: AlertSuppressionService;
  private readonly appConfigService: AppConfigService;
  private readonly tokenPricingPort: ITokenPricingPort;
  private readonly alertMessageFormatter: AlertMessageFormatter;
  private readonly telegramSenderService: TelegramSenderService;
  private readonly recipientEvaluatorService: AlertRecipientEvaluatorService;

  public constructor(dependencies: AlertDispatcherDependencies) {
    this.subscriptionsRepository = dependencies.subscriptionsRepository;
    this.alertEnrichmentService = dependencies.alertEnrichmentService;
    this.alertSuppressionService = dependencies.alertSuppressionService;
    this.appConfigService = dependencies.appConfigService;
    this.tokenPricingPort = dependencies.tokenPricingPort;
    this.alertMessageFormatter = dependencies.alertMessageFormatter;
    this.telegramSenderService = dependencies.telegramSenderService;
    this.recipientEvaluatorService = dependencies.recipientEvaluatorService;
  }

  public async dispatch(event: ClassifiedEvent): Promise<void> {
    const chainKey: ChainKey = this.resolveChainKey(event.chainId);

    this.logger.debug(
      `dispatch start chain=${chainKey} eventType=${event.eventType} trackedAddress=${event.trackedAddress} txHash=${event.txHash}`,
    );
    const subscribers: readonly SubscriberWalletRecipient[] =
      await this.subscriptionsRepository.listSubscriberWalletRecipientsByAddress(
        chainKey,
        event.trackedAddress,
      );

    if (subscribers.length === 0) {
      this.logger.debug(
        `dispatch skipped no subscribers chain=${chainKey} trackedAddress=${event.trackedAddress} txHash=${event.txHash}`,
      );
      return;
    }

    const suppressionDecision = this.alertSuppressionService.shouldSuppress(event);

    if (suppressionDecision.suppressed) {
      this.logger.debug(
        `dispatch suppressed chain=${chainKey} eventType=${event.eventType} trackedAddress=${event.trackedAddress} txHash=${event.txHash} reason=${suppressionDecision.reason ?? 'n/a'}`,
      );
      return;
    }

    const enrichedEvent: ClassifiedEvent = this.alertEnrichmentService.enrich(event);
    const eventUsdContext: IEventUsdContext = await this.resolveUsdContext(enrichedEvent, chainKey);

    this.logger.log(
      `dispatch sending chain=${chainKey} eventType=${event.eventType} recipients=${subscribers.length} txHash=${event.txHash}`,
    );

    let successfulDeliveries: number = 0;

    for (const subscriber of subscribers) {
      const decision: IDispatchDecision = await this.recipientEvaluatorService.evaluateRecipient(
        subscriber,
        enrichedEvent,
        chainKey,
        eventUsdContext,
      );

      if (decision.skip) {
        this.logger.debug(
          `dispatch skipped by user policy chain=${chainKey} telegramId=${subscriber.telegramId} walletId=${String(subscriber.walletId)} txHash=${event.txHash} reason=${decision.reason ?? 'n/a'}`,
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
        subscriber.chainKey,
      );

      try {
        await this.telegramSenderService.sendText(subscriber.telegramId, message, sendOptions);
        successfulDeliveries += 1;
      } catch (error: unknown) {
        const errorMessage: string = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `dispatch delivery failed chain=${chainKey} telegramId=${subscriber.telegramId} walletId=${String(subscriber.walletId)} txHash=${event.txHash} reason=${errorMessage}`,
        );
      }
    }

    this.logger.debug(
      `dispatch complete chain=${chainKey} txHash=${event.txHash} successful=${successfulDeliveries} failed=${subscribers.length - successfulDeliveries}`,
    );
  }

  private async resolveUsdContext(
    event: ClassifiedEvent,
    chainKey: ChainKey,
  ): Promise<IEventUsdContext> {
    const value: number | null = this.parsePositiveValue(event.valueFormatted);

    if (value === null) {
      const existingUsdAmount: number | null = this.resolveExistingUsdAmount(event);
      return existingUsdAmount === null
        ? this.buildUnavailableUsdContext()
        : this.buildResolvedUsdContext(existingUsdAmount);
    }

    const quote = await this.tokenPricingPort.getUsdQuote({
      chainKey,
      tokenAddress: event.tokenAddress,
      tokenSymbol: event.tokenSymbol,
    });

    if (quote === null || !Number.isFinite(quote.usdPrice) || quote.usdPrice <= 0) {
      const existingUsdAmount: number | null = this.resolveExistingUsdAmount(event);
      return existingUsdAmount === null
        ? this.buildUnavailableUsdContext()
        : this.buildResolvedUsdContext(existingUsdAmount);
    }

    return this.buildResolvedUsdContext(value * quote.usdPrice);
  }

  private resolveExistingUsdAmount(event: ClassifiedEvent): number | null {
    if (event.usdAmount === null) {
      return null;
    }

    if (!Number.isFinite(event.usdAmount) || event.usdAmount <= 0) {
      return null;
    }

    return event.usdAmount;
  }

  private parsePositiveValue(rawValue: string | null): number | null {
    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
      return null;
    }

    const parsedValue: number = Number.parseFloat(rawValue);

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return null;
    }

    return parsedValue;
  }

  private buildResolvedUsdContext(usdAmount: number): IEventUsdContext {
    return {
      usdAmount,
      usdUnavailable: false,
    };
  }

  private buildUnavailableUsdContext(): IEventUsdContext {
    return {
      usdAmount: null,
      usdUnavailable: true,
    };
  }

  private buildAlertInlineKeyboard(
    walletId: number,
    event: ClassifiedEvent,
    chainKey: ChainKey,
  ): TelegramSendTextOptions {
    const txUrl: string = this.buildTxUrl(chainKey, event.txHash);
    const txButtonLabel: string = this.getTxButtonLabel(chainKey);
    const chartUrl: string = this.buildChartUrl(event);
    const portfolioUrl: string = this.buildPortfolioUrl(chainKey, event.trackedAddress);
    const tmaUrl: string | null = this.buildTmaStartAppUrl(walletId);
    const inlineKeyboardRows: InlineKeyboardButton[][] = [
      [
        {
          text: '📊 Chart',
          url: chartUrl,
        },
        {
          text: txButtonLabel,
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
    ];

    if (tmaUrl !== null) {
      inlineKeyboardRows.push([
        {
          text: '📱 TMA',
          url: tmaUrl,
        },
      ]);
    }

    return {
      reply_markup: {
        inline_keyboard: inlineKeyboardRows,
      },
      link_preview_options: {
        is_disabled: true,
      },
    };
  }

  private buildChartUrl(event: ClassifiedEvent): string {
    const chainKey: ChainKey = this.resolveChainKey(event.chainId);

    if (event.tokenAddress !== null && event.tokenAddress.length > 0) {
      if (chainKey === ChainKey.SOLANA_MAINNET) {
        return `https://dexscreener.com/solana/${event.tokenAddress}`;
      }

      if (chainKey === ChainKey.TRON_MAINNET) {
        return `https://dexscreener.com/tron/${event.tokenAddress}`;
      }

      return `https://dexscreener.com/ethereum/${event.tokenAddress}`;
    }

    if (chainKey === ChainKey.SOLANA_MAINNET) {
      return 'https://www.tradingview.com/symbols/SOLUSD/';
    }

    if (chainKey === ChainKey.TRON_MAINNET) {
      return 'https://www.tradingview.com/symbols/TRXUSD/';
    }

    return 'https://www.tradingview.com/symbols/ETHUSD/';
  }

  private buildTxUrl(chainKey: ChainKey, txHash: string): string {
    if (chainKey === ChainKey.SOLANA_MAINNET) {
      return `https://solscan.io/tx/${txHash}`;
    }

    if (chainKey === ChainKey.TRON_MAINNET) {
      return `${this.appConfigService.tronscanTxBaseUrl}${txHash}`;
    }

    return `${this.appConfigService.etherscanTxBaseUrl}${txHash}`;
  }

  private buildPortfolioUrl(chainKey: ChainKey, trackedAddress: string): string {
    if (chainKey === ChainKey.SOLANA_MAINNET) {
      return `https://solscan.io/account/${trackedAddress}`;
    }

    if (chainKey === ChainKey.TRON_MAINNET) {
      return `https://tronscan.org/#/address/${trackedAddress}`;
    }

    return `https://debank.com/profile/${trackedAddress}`;
  }

  private getTxButtonLabel(chainKey: ChainKey): string {
    if (chainKey === ChainKey.SOLANA_MAINNET) {
      return '🔍 Solscan';
    }

    if (chainKey === ChainKey.TRON_MAINNET) {
      return '🔍 Tronscan';
    }

    return '🔍 Etherscan';
  }

  private buildTmaStartAppUrl(walletId: number): string | null {
    const botUsernameRaw: string | null | undefined = this.appConfigService.tmaBotUsername;

    if (typeof botUsernameRaw !== 'string' || botUsernameRaw.trim().length === 0) {
      return null;
    }

    return `https://t.me/${botUsernameRaw.trim()}?startapp=wallet_${String(walletId)}`;
  }

  private resolveChainKey(chainId: ChainId): ChainKey {
    if (chainId === ChainId.ETHEREUM_MAINNET) {
      return ChainKey.ETHEREUM_MAINNET;
    }

    if (chainId === ChainId.SOLANA_MAINNET) {
      return ChainKey.SOLANA_MAINNET;
    }

    return ChainKey.TRON_MAINNET;
  }
}
