import { Inject, Injectable, Logger } from '@nestjs/common';

import { AlertFilterPolicyService } from './alert-filter-policy.service';
import { CexAddressBookService } from './cex-address-book.service';
import { QuietHoursService } from './quiet-hours.service';
import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import { ClassifiedEventType, type ClassifiedEvent } from '../../../common/interfaces/chain.types';
import { AlertMutesRepository } from '../../../database/repositories/alert-mutes.repository';
import type { SubscriberWalletRecipient } from '../../../database/repositories/subscriptions.repository.interfaces';
import { UserAlertPreferencesRepository } from '../../../database/repositories/user-alert-preferences.repository';
import { UserAlertSettingsRepository } from '../../../database/repositories/user-alert-settings.repository';
import { UserWalletAlertPreferencesRepository } from '../../../database/repositories/user-wallet-alert-preferences.repository';
import type { IDispatchDecision, IEventUsdContext } from '../entities/alert-dispatcher.interfaces';
import type { IAlertFilterPolicy } from '../entities/alert-filter.interfaces';
import { AlertCexFlowMode, type IAlertCexFlowPolicy } from '../entities/cex-flow.interfaces';
import {
  AlertSmartFilterType,
  type IAlertSemanticFilterPolicy,
} from '../entities/smart-filter.interfaces';

interface IRecipientState {
  readonly preferences: Awaited<ReturnType<UserAlertPreferencesRepository['findOrCreateByUserId']>>;
  readonly settings: Awaited<ReturnType<UserAlertSettingsRepository['findOrCreateByUserAndChain']>>;
  readonly walletPreferences: Awaited<
    ReturnType<UserWalletAlertPreferencesRepository['findByUserAndWalletId']>
  >;
  readonly activeMute: Awaited<ReturnType<AlertMutesRepository['findActiveMute']>>;
}

@Injectable()
export class AlertRecipientEvaluatorDependencies {
  @Inject(UserAlertPreferencesRepository)
  public readonly userAlertPreferencesRepository!: UserAlertPreferencesRepository;

  @Inject(UserAlertSettingsRepository)
  public readonly userAlertSettingsRepository!: UserAlertSettingsRepository;

  @Inject(UserWalletAlertPreferencesRepository)
  public readonly userWalletAlertPreferencesRepository!: UserWalletAlertPreferencesRepository;

  @Inject(AlertMutesRepository)
  public readonly alertMutesRepository!: AlertMutesRepository;

  @Inject(QuietHoursService)
  public readonly quietHoursService!: QuietHoursService;

  @Inject(AlertFilterPolicyService)
  public readonly alertFilterPolicyService!: AlertFilterPolicyService;

  @Inject(CexAddressBookService)
  public readonly cexAddressBookService!: CexAddressBookService;
}

@Injectable()
export class AlertRecipientEvaluatorService {
  private readonly logger: Logger = new Logger(AlertRecipientEvaluatorService.name);
  private readonly userAlertPreferencesRepository: UserAlertPreferencesRepository;
  private readonly userAlertSettingsRepository: UserAlertSettingsRepository;
  private readonly userWalletAlertPreferencesRepository: UserWalletAlertPreferencesRepository;
  private readonly alertMutesRepository: AlertMutesRepository;
  private readonly quietHoursService: QuietHoursService;
  private readonly alertFilterPolicyService: AlertFilterPolicyService;
  private readonly cexAddressBookService: CexAddressBookService;

  public constructor(dependencies: AlertRecipientEvaluatorDependencies) {
    this.userAlertPreferencesRepository = dependencies.userAlertPreferencesRepository;
    this.userAlertSettingsRepository = dependencies.userAlertSettingsRepository;
    this.userWalletAlertPreferencesRepository = dependencies.userWalletAlertPreferencesRepository;
    this.alertMutesRepository = dependencies.alertMutesRepository;
    this.quietHoursService = dependencies.quietHoursService;
    this.alertFilterPolicyService = dependencies.alertFilterPolicyService;
    this.cexAddressBookService = dependencies.cexAddressBookService;
  }

  public async evaluateRecipient(
    subscriber: SubscriberWalletRecipient,
    event: ClassifiedEvent,
    chainKey: ChainKey,
    eventUsdContext: IEventUsdContext,
  ): Promise<IDispatchDecision> {
    const recipientState: IRecipientState = await this.loadRecipientState(subscriber);
    const preThresholdDecision: IDispatchDecision | null = this.evaluatePreThresholdDecisions(
      subscriber,
      recipientState,
      event,
      chainKey,
    );

    if (preThresholdDecision !== null) {
      return preThresholdDecision;
    }

    return this.evaluateThresholdAndSemanticDecisions(
      subscriber,
      recipientState,
      event,
      eventUsdContext,
    );
  }

  private async loadRecipientState(
    subscriber: SubscriberWalletRecipient,
  ): Promise<IRecipientState> {
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

    return {
      preferences,
      settings,
      walletPreferences,
      activeMute,
    };
  }

  private evaluatePreThresholdDecisions(
    subscriber: SubscriberWalletRecipient,
    recipientState: IRecipientState,
    event: ClassifiedEvent,
    chainKey: ChainKey,
  ): IDispatchDecision | null {
    if (recipientState.activeMute !== null) {
      return this.buildSkipDecision('wallet_muted_24h', null, false);
    }

    if (
      recipientState.preferences.muted_until !== null &&
      recipientState.preferences.muted_until.getTime() > Date.now()
    ) {
      return this.buildSkipDecision('global_mute', null, false);
    }

    if (this.isQuietHours(recipientState.settings, subscriber, chainKey)) {
      return this.buildSkipDecision('quiet_hours', null, false);
    }

    if (this.isTransferOrSwapDisabled(event, recipientState)) {
      const reason: string =
        event.eventType === ClassifiedEventType.TRANSFER ? 'transfer_disabled' : 'swap_disabled';
      return this.buildSkipDecision(reason, null, false);
    }

    if (this.isBlockedByLegacyMinAmount(event, recipientState.preferences.min_amount)) {
      return this.buildSkipDecision('legacy_min_amount', null, false);
    }

    return null;
  }

  private isQuietHours(
    settings: IRecipientState['settings'],
    subscriber: SubscriberWalletRecipient,
    chainKey: ChainKey,
  ): boolean {
    const quietEvaluation = this.quietHoursService.evaluate(
      settings.quiet_from,
      settings.quiet_to,
      settings.timezone,
    );

    if (!quietEvaluation.suppressed) {
      return false;
    }

    this.logger.debug(
      `alert_suppressed_quiet_hours telegramId=${subscriber.telegramId} walletId=${String(subscriber.walletId)} chainKey=${chainKey} timezone=${settings.timezone}`,
    );

    return true;
  }

  private isTransferOrSwapDisabled(
    event: ClassifiedEvent,
    recipientState: IRecipientState,
  ): boolean {
    const allowTransfer: boolean = recipientState.walletPreferences
      ? recipientState.walletPreferences.allow_transfer
      : recipientState.preferences.allow_transfer;
    const allowSwap: boolean = recipientState.walletPreferences
      ? recipientState.walletPreferences.allow_swap
      : recipientState.preferences.allow_swap;

    if (event.eventType === ClassifiedEventType.TRANSFER) {
      return !allowTransfer;
    }

    if (event.eventType === ClassifiedEventType.SWAP) {
      return !allowSwap;
    }

    return false;
  }

  private isBlockedByLegacyMinAmount(event: ClassifiedEvent, rawMinAmount: unknown): boolean {
    const legacyMinAmount: number = Number.parseFloat(String(rawMinAmount));

    if (legacyMinAmount <= 0) {
      return false;
    }

    const value: number | null = event.valueFormatted
      ? Number.parseFloat(event.valueFormatted)
      : null;
    return value === null || Number.isNaN(value) || value < legacyMinAmount;
  }

  private evaluateThresholdAndSemanticDecisions(
    subscriber: SubscriberWalletRecipient,
    recipientState: IRecipientState,
    event: ClassifiedEvent,
    eventUsdContext: IEventUsdContext,
  ): IDispatchDecision {
    const policy: IAlertFilterPolicy = this.resolveThresholdPolicy(recipientState.settings);
    const thresholdDecision = this.alertFilterPolicyService.evaluateUsdThreshold(
      policy,
      eventUsdContext.usdAmount,
      eventUsdContext.usdUnavailable,
    );

    if (!thresholdDecision.allowed) {
      return this.buildSkipDecision(
        thresholdDecision.suppressedReason,
        thresholdDecision.usdAmount,
        false,
      );
    }

    const usdWarningEnabled: boolean =
      thresholdDecision.usdUnavailable && (policy.thresholdUsd > 0 || policy.minAmountUsd > 0);
    const semanticDecision: IDispatchDecision | null = this.evaluateSemanticAndCexDecisions({
      subscriber,
      recipientState,
      event,
      usdAmount: thresholdDecision.usdAmount,
      usdWarningEnabled,
    });

    if (semanticDecision !== null) {
      return semanticDecision;
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

  private resolveThresholdPolicy(settings: IRecipientState['settings']): IAlertFilterPolicy {
    const parsedThreshold: number = Number.parseFloat(String(settings.threshold_usd));
    const parsedMinAmount: number = Number.parseFloat(String(settings.min_amount_usd));

    return {
      thresholdUsd: Number.isNaN(parsedThreshold) ? 0 : parsedThreshold,
      minAmountUsd: Number.isNaN(parsedMinAmount) ? 0 : parsedMinAmount,
    };
  }

  private evaluateSemanticAndCexDecisions(input: {
    readonly subscriber: SubscriberWalletRecipient;
    readonly recipientState: IRecipientState;
    readonly event: ClassifiedEvent;
    readonly usdAmount: number | null;
    readonly usdWarningEnabled: boolean;
  }): IDispatchDecision | null {
    const semanticPolicy: IAlertSemanticFilterPolicy = this.mapSemanticPolicy(
      input.recipientState.settings,
    );
    const semanticDecision = this.alertFilterPolicyService.evaluateSemanticFilters(semanticPolicy, {
      eventType: input.event.eventType,
      direction: input.event.direction,
      dex: input.event.dex,
    });

    if (!semanticDecision.allowed) {
      return this.buildSkipDecision(
        semanticDecision.suppressedReason,
        input.usdAmount,
        input.usdWarningEnabled,
      );
    }

    const cexPolicy: IAlertCexFlowPolicy = this.mapCexFlowPolicy(input.recipientState.settings);
    const counterpartyTag: string | null = this.cexAddressBookService.resolveTag(
      input.subscriber.chainKey,
      input.event.counterpartyAddress,
    );
    const cexDecision = this.alertFilterPolicyService.evaluateCexFlow(cexPolicy, {
      eventType: input.event.eventType,
      direction: input.event.direction,
      counterpartyTag,
    });

    if (!cexDecision.allowed) {
      return this.buildSkipDecision(
        cexDecision.suppressedReason,
        input.usdAmount,
        input.usdWarningEnabled,
      );
    }

    return null;
  }

  private buildSkipDecision(
    reason: string | null,
    usdAmount: number | null,
    usdUnavailable: boolean,
  ): IDispatchDecision {
    return {
      skip: true,
      reason,
      messageContext: {
        usdAmount,
        usdUnavailable,
      },
    };
  }

  private mapSemanticPolicy(settings: {
    readonly smart_filter_type?: string | null;
    readonly include_dexes?: readonly string[] | null;
    readonly exclude_dexes?: readonly string[] | null;
  }): IAlertSemanticFilterPolicy {
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
  }): IAlertCexFlowPolicy {
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
}
