import type { ChainKey } from '../../common/interfaces/chain-key.interfaces';

export type UserWalletSubscriptionView = {
  readonly subscriptionId: number;
  readonly walletId: number;
  readonly chainKey: ChainKey;
  readonly walletAddress: string;
  readonly walletLabel: string | null;
  readonly createdAt: Date;
};

export type SubscriberWalletRecipient = {
  readonly telegramId: string;
  readonly userId: number;
  readonly walletId: number;
  readonly chainKey: ChainKey;
};
