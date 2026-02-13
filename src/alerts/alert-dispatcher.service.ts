import { Inject, Injectable, Logger } from '@nestjs/common';

import type { IDispatchDecision, IEventUsdContext } from './alert-dispatcher.interfaces';
import { AlertEnrichmentService } from './alert-enrichment.service';
import { AlertMessageFormatter } from './alert-message.formatter';
import { AlertRecipientEvaluatorService } from './alert-recipient-evaluator.service';
import { AlertSuppressionService } from './alert-suppression.service';
import { ChainId, type ClassifiedEvent } from '../chain/chain.types';
import { AppConfigService } from '../config/app-config.service';
import { ChainKey } from '../core/chains/chain-key.interfaces';
import { TOKEN_PRICING_PORT } from '../core/ports/token-pricing/token-pricing-port.tokens';
import type { ITokenPricingPort } from '../core/ports/token-pricing/token-pricing.interfaces';
import { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import type { SubscriberWalletRecipient } from '../storage/repositories/subscriptions.repository.interfaces';
import type { TelegramSendTextOptions } from '../telegram/telegram-sender.service';
import { TelegramSenderService } from '../telegram/telegram-sender.service';

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
export class AlertDispatcherService {
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
    const eventUsdContext: IEventUsdContext = await this.resolveUsdContext(enrichedEvent, chainKey);

    this.logger.log(
      `dispatch sending eventType=${event.eventType} recipients=${subscribers.length} txHash=${event.txHash}`,
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
        subscriber.chainKey,
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

  private async resolveUsdContext(
    event: ClassifiedEvent,
    chainKey: ChainKey,
  ): Promise<IEventUsdContext> {
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
    chainKey: ChainKey,
  ): TelegramSendTextOptions {
    const txUrl: string = this.buildTxUrl(chainKey, event.txHash);
    const txButtonLabel: string = this.getTxButtonLabel(chainKey);
    const chartUrl: string = this.buildChartUrl(event);
    const portfolioUrl: string = this.buildPortfolioUrl(chainKey, event.trackedAddress);

    return {
      reply_markup: {
        inline_keyboard: [
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
        ],
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
