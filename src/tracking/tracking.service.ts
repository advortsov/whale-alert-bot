import { Injectable, Logger } from '@nestjs/common';

import { isEthereumAddressCandidate, tryNormalizeEthereumAddress } from './address.util';
import { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import { TrackedWalletsRepository } from '../storage/repositories/tracked-wallets.repository';
import { UsersRepository } from '../storage/repositories/users.repository';

export type TelegramUserRef = {
  readonly telegramId: string;
  readonly username: string | null;
};

@Injectable()
export class TrackingService {
  private readonly logger: Logger = new Logger(TrackingService.name);

  public constructor(
    private readonly usersRepository: UsersRepository,
    private readonly trackedWalletsRepository: TrackedWalletsRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
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
      throw new Error('Неверный Ethereum адрес. Используй формат 0x + 40 hex-символов.');
    }

    const normalizedAddress: string | null = tryNormalizeEthereumAddress(rawAddress);

    if (!normalizedAddress) {
      this.logger.warn(
        `trackAddress invalid checksum telegramId=${userRef.telegramId} rawAddress=${rawAddress}`,
      );
      throw new Error('Неверный Ethereum адрес. Проверь символы и checksum.');
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
      return `Адрес ${normalizedAddress} уже отслеживается.`;
    }

    this.logger.log(
      `trackAddress success telegramId=${userRef.telegramId} walletId=${wallet.id} address=${normalizedAddress}`,
    );
    if (label) {
      return `Добавил адрес ${normalizedAddress} (${label}) в отслеживание.`;
    }

    return `Добавил адрес ${normalizedAddress} в отслеживание.`;
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
      return 'Список отслеживания пуст. Используй /track <address> [label].';
    }

    const rows: string[] = subscriptions.map((subscription, index: number): string => {
      const labelPart: string = subscription.walletLabel ? ` (${subscription.walletLabel})` : '';
      return `${index + 1}. #${subscription.walletId} ${subscription.walletAddress}${labelPart}`;
    });

    return ['Отслеживаемые адреса:', ...rows].join('\n');
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
        : `Не нашел подписку с id #${walletId}.`;
    }

    const normalizedAddress: string | null = tryNormalizeEthereumAddress(rawIdentifier);

    if (!normalizedAddress) {
      this.logger.warn(
        `untrackAddress invalid identifier telegramId=${userRef.telegramId} identifier=${rawIdentifier}`,
      );
      throw new Error('Неверный идентификатор. Передай id (#123) или Ethereum адрес.');
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
      : `Адрес ${normalizedAddress} не найден в списке.`;
  }

  private parseWalletId(rawIdentifier: string): number | null {
    const normalizedIdentifier: string = rawIdentifier.trim().replace('#', '');

    if (!/^\d+$/.test(normalizedIdentifier)) {
      return null;
    }

    return Number.parseInt(normalizedIdentifier, 10);
  }
}
