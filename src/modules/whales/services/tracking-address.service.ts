import { Inject, Injectable } from '@nestjs/common';

import type { IAddressCodecRegistry } from '../../../common/interfaces/address/address-codec-registry.interfaces';
import { ADDRESS_CODEC_REGISTRY } from '../../../common/interfaces/address/address-port.tokens';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import { SubscriptionsRepository } from '../../../database/repositories/subscriptions.repository';
import type {
  INormalizedAddressCandidate,
  IResolvedHistoryTarget,
  IResolvedTrackedWalletSubscription,
} from '../entities/tracking-address.interfaces';

@Injectable()
export class TrackingAddressService {
  private static readonly SUPPORTED_TRACK_CHAINS: readonly ChainKey[] = [
    ChainKey.ETHEREUM_MAINNET,
    ChainKey.SOLANA_MAINNET,
    ChainKey.TRON_MAINNET,
  ];

  public constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
    @Inject(ADDRESS_CODEC_REGISTRY)
    private readonly addressCodecRegistry: IAddressCodecRegistry,
  ) {}

  public parseWalletId(rawIdentifier: string): number | null {
    const normalizedIdentifier: string = rawIdentifier.trim().replace('#', '');

    if (!/^\d+$/.test(normalizedIdentifier)) {
      return null;
    }

    return Number.parseInt(normalizedIdentifier, 10);
  }

  public normalizeDbId(rawValue: unknown): number | null {
    if (typeof rawValue === 'number' && Number.isSafeInteger(rawValue) && rawValue > 0) {
      return rawValue;
    }

    if (typeof rawValue !== 'string') {
      return null;
    }

    const trimmed: string = rawValue.trim();

    if (!/^\d+$/.test(trimmed)) {
      return null;
    }

    const parsed: number = Number.parseInt(trimmed, 10);

    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }

  public async resolveWalletSubscription(
    userId: number,
    rawWalletId: string,
  ): Promise<IResolvedTrackedWalletSubscription> {
    const walletId: number | null = this.parseWalletId(rawWalletId);

    if (walletId === null) {
      throw new Error('Неверный id кошелька. Используй формат #3.');
    }

    const subscriptions = await this.subscriptionsRepository.listByUserId(userId);
    const matchedSubscription: IResolvedTrackedWalletSubscription | null =
      this.findSubscriptionByWalletId(subscriptions, walletId);

    if (matchedSubscription === null) {
      throw new Error(`Не нашел адрес с id #${walletId}. Сначала проверь /list.`);
    }

    return matchedSubscription;
  }

  public async resolveHistoryTarget(
    userId: number,
    rawAddress: string,
  ): Promise<IResolvedHistoryTarget> {
    const walletId: number | null = this.parseWalletId(rawAddress);

    if (walletId !== null) {
      const subscriptions = await this.subscriptionsRepository.listByUserId(userId);
      const matchedSubscription: IResolvedTrackedWalletSubscription | null =
        this.findSubscriptionByWalletId(subscriptions, walletId);

      if (matchedSubscription === null) {
        throw new Error(`Не нашел адрес с id #${walletId}. Сначала проверь /list.`);
      }

      return {
        chainKey: matchedSubscription.chainKey,
        address: matchedSubscription.walletAddress,
        walletId,
      };
    }

    const normalizedAddresses: readonly INormalizedAddressCandidate[] =
      this.resolveNormalizedAddressCandidates(rawAddress);
    const firstCandidate: INormalizedAddressCandidate | undefined = normalizedAddresses[0];

    if (!firstCandidate) {
      throw new Error(
        [
          'Неверный адрес.',
          'Поддерживаются Ethereum, Solana и TRON адреса.',
          'Можно передать id из /list: /history #3 10',
        ].join('\n'),
      );
    }

    return {
      chainKey: firstCandidate.chainKey,
      address: firstCandidate.address,
      walletId: null,
    };
  }

  public resolveNormalizedAddressCandidates(
    rawAddress: string,
  ): readonly INormalizedAddressCandidate[] {
    const resolved: INormalizedAddressCandidate[] = [];

    for (const chainKey of TrackingAddressService.SUPPORTED_TRACK_CHAINS) {
      const codec = this.addressCodecRegistry.getCodec(chainKey);
      const normalizedAddress: string | null = codec.normalize(rawAddress);

      if (normalizedAddress !== null) {
        resolved.push({
          chainKey,
          address: normalizedAddress,
        });
      }
    }

    return resolved;
  }

  public buildInvalidAddressFormatMessage(chainKey: ChainKey): string {
    if (chainKey === ChainKey.ETHEREUM_MAINNET) {
      return [
        'Неверный Ethereum адрес.',
        'Ожидаю формат 0x + 40 hex-символов.',
        'Пример: /track eth 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 vitalik',
      ].join('\n');
    }

    if (chainKey === ChainKey.SOLANA_MAINNET) {
      return [
        'Неверный Solana адрес.',
        'Ожидаю base58 адрес длиной 32 байта.',
        'Пример: /track sol 11111111111111111111111111111111 test-wallet',
      ].join('\n');
    }

    return [
      'Неверный TRON адрес.',
      'Ожидаю base58 (T...) или hex формат (41.../0x...).',
      'Пример: /track tron TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7 treasury',
    ].join('\n');
  }

  public buildInvalidAddressNormalizationMessage(chainKey: ChainKey): string {
    if (chainKey === ChainKey.ETHEREUM_MAINNET) {
      return [
        'Неверный Ethereum адрес: ошибка checksum.',
        'Совет: передай адрес целиком в lower-case, бот сам нормализует checksum.',
      ].join('\n');
    }

    if (chainKey === ChainKey.SOLANA_MAINNET) {
      return ['Неверный Solana адрес.', 'Проверь символы base58 и корректность длины.'].join('\n');
    }

    return [
      'Не удалось нормализовать TRON адрес.',
      'Проверь base58 checksum или hex-представление адреса.',
    ].join('\n');
  }

  public assertHistoryChainIsSupported(chainKey: ChainKey): void {
    const chainKeyValue: string = chainKey;
    const supportedHistoryChains: readonly string[] = [
      ChainKey.ETHEREUM_MAINNET,
      ChainKey.SOLANA_MAINNET,
      ChainKey.TRON_MAINNET,
    ];

    if (supportedHistoryChains.includes(chainKeyValue)) {
      return;
    }

    throw new Error(
      [
        `История для сети ${chainKeyValue} пока недоступна на этом этапе.`,
        'Сейчас поддерживаются /history для Ethereum, Solana и TRON.',
      ].join('\n'),
    );
  }

  private findSubscriptionByWalletId(
    subscriptions: readonly {
      readonly walletId: number;
      readonly chainKey?: ChainKey;
      readonly walletAddress: string;
      readonly walletLabel: string | null;
    }[],
    targetWalletId: number,
  ): IResolvedTrackedWalletSubscription | null {
    for (const subscription of subscriptions) {
      const subscriptionWalletId: number | null = this.normalizeDbId(subscription.walletId);

      if (subscriptionWalletId === targetWalletId) {
        return {
          walletId: subscriptionWalletId,
          chainKey: subscription.chainKey ?? ChainKey.ETHEREUM_MAINNET,
          walletAddress: subscription.walletAddress,
          walletLabel: subscription.walletLabel,
        };
      }
    }

    return null;
  }
}
