import { Injectable, Logger } from '@nestjs/common';
import { formatUnits } from 'ethers';

import { isEthereumAddressCandidate, tryNormalizeEthereumAddress } from './address.util';
import type { HistoryTransactionItem } from './etherscan-history.interfaces';
import { EtherscanHistoryService } from './etherscan-history.service';
import type { HistoryCacheEntry } from './history-cache.interfaces';
import { HistoryCacheService } from './history-cache.service';
import {
  HistoryRateLimitReason,
  HistoryRequestSource,
  type HistoryRateLimitDecision,
} from './history-rate-limiter.interfaces';
import { HistoryRateLimiterService } from './history-rate-limiter.service';
import type { TelegramUserRef, TrackedWalletOption } from './tracking.interfaces';
import { AppConfigService } from '../config/app-config.service';
import { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import { TrackedWalletsRepository } from '../storage/repositories/tracked-wallets.repository';
import { UsersRepository } from '../storage/repositories/users.repository';

@Injectable()
export class TrackingService {
  private readonly logger: Logger = new Logger(TrackingService.name);
  private static readonly DEFAULT_HISTORY_LIMIT: number = 5;
  private static readonly MAX_HISTORY_LIMIT: number = 20;

  public constructor(
    private readonly usersRepository: UsersRepository,
    private readonly trackedWalletsRepository: TrackedWalletsRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly etherscanHistoryService: EtherscanHistoryService,
    private readonly historyCacheService: HistoryCacheService,
    private readonly historyRateLimiterService: HistoryRateLimiterService,
    private readonly appConfigService: AppConfigService,
  ) {}

  public async trackAddress(
    userRef: TelegramUserRef,
    rawAddress: string,
    label: string | null,
  ): Promise<string> {
    this.logger.debug(
      `trackAddress start telegramId=${userRef.telegramId} rawAddress=${rawAddress} label=${label ?? 'n/a'}`,
    );
    if (!isEthereumAddressCandidate(rawAddress)) {
      this.logger.warn(
        `trackAddress invalid format telegramId=${userRef.telegramId} rawAddress=${rawAddress}`,
      );
      throw new Error(
        [
          'Неверный Ethereum адрес.',
          'Ожидаю формат 0x + 40 hex-символов.',
          'Пример: /track 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 vitalik',
        ].join('\n'),
      );
    }

    const normalizedAddress: string | null = tryNormalizeEthereumAddress(rawAddress);

    if (!normalizedAddress) {
      this.logger.warn(
        `trackAddress invalid checksum telegramId=${userRef.telegramId} rawAddress=${rawAddress}`,
      );
      throw new Error(
        [
          'Неверный Ethereum адрес: ошибка checksum.',
          'Совет: передай адрес целиком в lower-case, бот сам нормализует checksum.',
        ].join('\n'),
      );
    }

    this.logger.debug(`trackAddress normalizedAddress=${normalizedAddress}`);

    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const wallet = await this.trackedWalletsRepository.findOrCreate(normalizedAddress, label);
    const insertedSubscription = await this.subscriptionsRepository.addSubscription(
      user.id,
      wallet.id,
    );

    if (!insertedSubscription) {
      this.logger.log(
        `trackAddress skipped duplicate telegramId=${userRef.telegramId} address=${normalizedAddress}`,
      );
      return [
        `Адрес уже отслеживается: #${wallet.id} ${normalizedAddress}.`,
        `История: /history #${wallet.id} ${TrackingService.DEFAULT_HISTORY_LIMIT}`,
      ].join('\n');
    }

    this.logger.log(
      `trackAddress success telegramId=${userRef.telegramId} walletId=${wallet.id} address=${normalizedAddress}`,
    );
    if (label) {
      return [
        `Добавил адрес #${wallet.id} ${normalizedAddress} (${label}).`,
        `История: /history #${wallet.id} ${TrackingService.DEFAULT_HISTORY_LIMIT}`,
        `Удалить: /untrack #${wallet.id}`,
      ].join('\n');
    }

    return [
      `Добавил адрес #${wallet.id} ${normalizedAddress}.`,
      `История: /history #${wallet.id} ${TrackingService.DEFAULT_HISTORY_LIMIT}`,
      `Удалить: /untrack #${wallet.id}`,
    ].join('\n');
  }

  public async listTrackedAddresses(userRef: TelegramUserRef): Promise<string> {
    this.logger.debug(`listTrackedAddresses start telegramId=${userRef.telegramId}`);
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const subscriptions = await this.subscriptionsRepository.listByUserId(user.id);
    this.logger.debug(
      `listTrackedAddresses loaded telegramId=${userRef.telegramId} count=${subscriptions.length}`,
    );

    if (subscriptions.length === 0) {
      this.logger.log(`listTrackedAddresses empty telegramId=${userRef.telegramId}`);
      return ['Список отслеживания пуст.', 'Добавь первый адрес:', '/track <address> [label]'].join(
        '\n',
      );
    }

    const rows: string[] = subscriptions.map((subscription, index: number): string => {
      const labelPart: string = subscription.walletLabel ? ` (${subscription.walletLabel})` : '';
      return [
        `${index + 1}. #${subscription.walletId}${labelPart}`,
        `   ${subscription.walletAddress}`,
        `   История: /history #${subscription.walletId} ${TrackingService.DEFAULT_HISTORY_LIMIT}`,
        `   Удалить: /untrack #${subscription.walletId}`,
      ].join('\n');
    });

    return [`Отслеживаемые адреса (${subscriptions.length}):`, ...rows].join('\n');
  }

  public async listTrackedWalletOptions(
    userRef: TelegramUserRef,
  ): Promise<readonly TrackedWalletOption[]> {
    this.logger.debug(`listTrackedWalletOptions start telegramId=${userRef.telegramId}`);
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const subscriptions = await this.subscriptionsRepository.listByUserId(user.id);

    return subscriptions.map(
      (subscription): TrackedWalletOption => ({
        walletId: subscription.walletId,
        walletAddress: subscription.walletAddress,
        walletLabel: subscription.walletLabel,
      }),
    );
  }

  public async untrackAddress(userRef: TelegramUserRef, rawIdentifier: string): Promise<string> {
    this.logger.debug(
      `untrackAddress start telegramId=${userRef.telegramId} identifier=${rawIdentifier}`,
    );
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);

    const walletId: number | null = this.parseWalletId(rawIdentifier);

    if (walletId !== null) {
      const removedById: boolean = await this.subscriptionsRepository.removeByWalletId(
        user.id,
        walletId,
      );
      this.logger.log(
        `untrackAddress byId telegramId=${userRef.telegramId} walletId=${walletId} removed=${String(removedById)}`,
      );
      return removedById
        ? `Удалил адрес с id #${walletId} из отслеживания.`
        : `Не нашел подписку с id #${walletId}. Проверь список через /list.`;
    }

    const normalizedAddress: string | null = tryNormalizeEthereumAddress(rawIdentifier);

    if (!normalizedAddress) {
      this.logger.warn(
        `untrackAddress invalid identifier telegramId=${userRef.telegramId} identifier=${rawIdentifier}`,
      );
      throw new Error(
        [
          'Неверный идентификатор.',
          'Передай id из /list или Ethereum адрес.',
          'Примеры: /untrack #3 или /untrack 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        ].join('\n'),
      );
    }

    const removedByAddress: boolean = await this.subscriptionsRepository.removeByAddress(
      user.id,
      normalizedAddress,
    );
    this.logger.log(
      `untrackAddress byAddress telegramId=${userRef.telegramId} address=${normalizedAddress} removed=${String(removedByAddress)}`,
    );

    return removedByAddress
      ? `Удалил адрес ${normalizedAddress} из отслеживания.`
      : `Адрес ${normalizedAddress} не найден в списке. Проверь /list.`;
  }

  public async getAddressHistory(
    userRef: TelegramUserRef,
    rawAddress: string,
    rawLimit: string | null,
  ): Promise<string> {
    return this.getAddressHistoryWithPolicy(
      userRef,
      rawAddress,
      rawLimit,
      HistoryRequestSource.COMMAND,
    );
  }

  public async getAddressHistoryWithPolicy(
    userRef: TelegramUserRef,
    rawAddress: string,
    rawLimit: string | null,
    source: HistoryRequestSource,
  ): Promise<string> {
    this.logger.debug(
      `getAddressHistoryWithPolicy start telegramId=${userRef.telegramId} source=${source} rawAddress=${rawAddress} rawLimit=${rawLimit ?? 'n/a'}`,
    );

    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const normalizedAddress: string = await this.resolveHistoryAddress(user.id, rawAddress);
    const limit: number = this.parseHistoryLimit(rawLimit);
    const rateLimitDecision: HistoryRateLimitDecision = this.historyRateLimiterService.evaluate(
      userRef.telegramId,
      source,
    );

    if (!rateLimitDecision.allowed) {
      this.logger.warn(
        `history_rate_limited telegramId=${userRef.telegramId} source=${source} address=${normalizedAddress} limit=${String(limit)} reason=${rateLimitDecision.reason} retryAfterSec=${String(rateLimitDecision.retryAfterSec ?? 0)}`,
      );

      const staleEntry: HistoryCacheEntry | null = this.historyCacheService.getStale(
        normalizedAddress,
        limit,
      );

      if (staleEntry) {
        this.logger.warn(
          `history_stale_served telegramId=${userRef.telegramId} source=${source} address=${normalizedAddress} limit=${String(limit)} reason=local_rate_limit`,
        );
        return this.buildStaleMessage(staleEntry.message);
      }

      throw new Error(this.buildHistoryRetryMessage(rateLimitDecision));
    }

    const freshEntry: HistoryCacheEntry | null = this.historyCacheService.getFresh(
      normalizedAddress,
      limit,
    );

    if (freshEntry) {
      this.logger.debug(
        `history_cache_hit telegramId=${userRef.telegramId} source=${source} address=${normalizedAddress} limit=${String(limit)}`,
      );
      return freshEntry.message;
    }

    this.logger.debug(
      `history_cache_miss telegramId=${userRef.telegramId} source=${source} address=${normalizedAddress} limit=${String(limit)}`,
    );

    try {
      const transactions = await this.etherscanHistoryService.loadRecentTransactions(
        normalizedAddress,
        limit,
      );
      const historyMessage: string = this.formatHistoryMessage(normalizedAddress, transactions);
      this.historyCacheService.set(normalizedAddress, limit, historyMessage);
      return historyMessage;
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `history_fetch_failed telegramId=${userRef.telegramId} source=${source} address=${normalizedAddress} limit=${String(limit)} reason=${errorMessage}`,
      );

      if (!this.isRateLimitOrTimeout(errorMessage)) {
        throw error;
      }

      const staleEntry: HistoryCacheEntry | null = this.historyCacheService.getStale(
        normalizedAddress,
        limit,
      );

      if (staleEntry) {
        this.logger.warn(
          `history_stale_served telegramId=${userRef.telegramId} source=${source} address=${normalizedAddress} limit=${String(limit)} reason=external_rate_limit`,
        );
        return this.buildStaleMessage(staleEntry.message);
      }

      throw new Error(this.buildHistoryRetryMessage(rateLimitDecision));
    }
  }

  private parseWalletId(rawIdentifier: string): number | null {
    const normalizedIdentifier: string = rawIdentifier.trim().replace('#', '');

    if (!/^\d+$/.test(normalizedIdentifier)) {
      return null;
    }

    return Number.parseInt(normalizedIdentifier, 10);
  }

  private async resolveHistoryAddress(userId: number, rawAddress: string): Promise<string> {
    const walletId: number | null = this.parseWalletId(rawAddress);

    if (walletId !== null) {
      const subscriptions = await this.subscriptionsRepository.listByUserId(userId);
      const matchedSubscription = subscriptions.find(
        (subscription): boolean => subscription.walletId === walletId,
      );

      if (!matchedSubscription) {
        throw new Error(`Не нашел адрес с id #${walletId}. Сначала проверь /list.`);
      }

      return matchedSubscription.walletAddress;
    }

    if (!isEthereumAddressCandidate(rawAddress)) {
      throw new Error(
        [
          'Неверный Ethereum адрес.',
          'Ожидаю формат 0x + 40 hex-символов.',
          'Можно передать id из /list: /history #3 10',
        ].join('\n'),
      );
    }

    const normalizedAddress: string | null = tryNormalizeEthereumAddress(rawAddress);

    if (!normalizedAddress) {
      throw new Error(
        [
          'Неверный Ethereum адрес: ошибка checksum.',
          'Совет: передай адрес целиком в lower-case, бот сам нормализует checksum.',
        ].join('\n'),
      );
    }

    return normalizedAddress;
  }

  private parseHistoryLimit(rawLimit: string | null): number {
    if (!rawLimit) {
      return TrackingService.DEFAULT_HISTORY_LIMIT;
    }

    const normalizedValue: string = rawLimit.trim();

    if (!/^\d+$/.test(normalizedValue)) {
      throw new Error(
        `Неверный limit "${rawLimit}". Используй число от 1 до ${TrackingService.MAX_HISTORY_LIMIT}.`,
      );
    }

    const limit: number = Number.parseInt(normalizedValue, 10);

    if (limit < 1 || limit > TrackingService.MAX_HISTORY_LIMIT) {
      throw new Error(
        `Неверный limit "${rawLimit}". Используй число от 1 до ${TrackingService.MAX_HISTORY_LIMIT}.`,
      );
    }

    return limit;
  }

  private formatHistoryMessage(
    normalizedAddress: string,
    transactions: readonly HistoryTransactionItem[],
  ): string {
    if (transactions.length === 0) {
      return `История для ${normalizedAddress} пуста.`;
    }

    const rows: string[] = transactions.map((tx, index: number): string => {
      const direction: string =
        tx.from.toLowerCase() === normalizedAddress.toLowerCase() ? 'OUT' : 'IN';
      const date: Date = new Date(tx.timestampSec * 1000);
      const formattedValue: string = this.formatAssetValue(tx.valueRaw, tx.assetDecimals);
      const statusIcon: string = tx.isError ? '🔴' : '🟢';
      const directionIcon: string = direction === 'OUT' ? '↗️ OUT' : '↘️ IN';
      const escapedAssetSymbol: string = this.escapeHtml(tx.assetSymbol);
      const txUrl: string = this.buildTxUrl(tx.hash);

      return [
        `<a href="${txUrl}">Tx #${index + 1}</a> ${statusIcon} ${directionIcon} <b>${formattedValue} ${escapedAssetSymbol}</b>`,
        `🕒 <code>${this.formatTimestamp(date)}</code>`,
        `🔹 <code>${this.shortHash(tx.hash)}</code>`,
      ].join('\n');
    });

    return [
      `📜 <b>История</b> <code>${normalizedAddress}</code>`,
      `Последние ${transactions.length} tx:`,
      ...rows,
    ].join('\n\n');
  }

  private buildStaleMessage(cachedHistoryMessage: string): string {
    return [
      '⚠️ Показал кешированную историю (данные могут быть неактуальны).',
      cachedHistoryMessage,
    ].join('\n\n');
  }

  private buildHistoryRetryMessage(decision: HistoryRateLimitDecision): string {
    const retryAfterSec: number = decision.retryAfterSec ?? 1;

    if (decision.reason === HistoryRateLimitReason.CALLBACK_COOLDOWN) {
      return `Слишком часто нажимаешь кнопку истории. Повтори через ${String(retryAfterSec)} сек.`;
    }

    return `Слишком много запросов к истории. Повтори через ${String(retryAfterSec)} сек.`;
  }

  private isRateLimitOrTimeout(errorMessage: string): boolean {
    const normalizedMessage: string = errorMessage.toLowerCase();

    return (
      normalizedMessage.includes('rate limit') ||
      normalizedMessage.includes('http 429') ||
      normalizedMessage.includes('timeout') ||
      normalizedMessage.includes('aborted') ||
      normalizedMessage.includes('too many requests')
    );
  }

  private formatAssetValue(valueRaw: string, decimals: number): string {
    try {
      const formatted: string = formatUnits(BigInt(valueRaw), decimals);
      return Number.parseFloat(formatted).toFixed(6);
    } catch {
      return '0.000000';
    }
  }

  private formatTimestamp(date: Date): string {
    const isoTimestamp: string = date.toISOString();
    return isoTimestamp.replace('T', ' ').replace('.000Z', ' UTC');
  }

  private buildTxUrl(txHash: string): string {
    return `${this.appConfigService.etherscanTxBaseUrl}${txHash}`;
  }

  private shortHash(txHash: string): string {
    const prefix: string = txHash.slice(0, 10);
    const suffix: string = txHash.slice(-8);
    return `${prefix}...${suffix}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
