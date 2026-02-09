import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database.service';
import type {
  NewUserWalletSubscriptionRow,
  TrackedWalletRow,
  UserWalletSubscriptionRow,
} from '../database.types';

export type UserWalletSubscriptionView = {
  readonly subscriptionId: number;
  readonly walletId: number;
  readonly walletAddress: string;
  readonly walletLabel: string | null;
  readonly createdAt: Date;
};

@Injectable()
export class SubscriptionsRepository {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async addSubscription(
    userId: number,
    walletId: number,
  ): Promise<UserWalletSubscriptionRow | null> {
    const newSubscription: NewUserWalletSubscriptionRow = {
      user_id: userId,
      wallet_id: walletId,
    };

    const insertedSubscription: UserWalletSubscriptionRow | undefined = await this.databaseService
      .getDb()
      .insertInto('user_wallet_subscriptions')
      .values(newSubscription)
      .onConflict((oc) => oc.columns(['user_id', 'wallet_id']).doNothing())
      .returningAll()
      .executeTakeFirst();

    return insertedSubscription ?? null;
  }

  public async listByUserId(userId: number): Promise<readonly UserWalletSubscriptionView[]> {
    const rows: readonly {
      id: number;
      wallet_id: number;
      address: string;
      label: string | null;
      created_at: Date;
    }[] = await this.databaseService
      .getDb()
      .selectFrom('user_wallet_subscriptions')
      .innerJoin('tracked_wallets', 'tracked_wallets.id', 'user_wallet_subscriptions.wallet_id')
      .select([
        'user_wallet_subscriptions.id',
        'tracked_wallets.id as wallet_id',
        'tracked_wallets.address',
        'tracked_wallets.label',
        'user_wallet_subscriptions.created_at',
      ])
      .where('user_wallet_subscriptions.user_id', '=', userId)
      .orderBy('user_wallet_subscriptions.created_at', 'asc')
      .execute();

    return rows.map(
      (row): UserWalletSubscriptionView => ({
        subscriptionId: row.id,
        walletId: row.wallet_id,
        walletAddress: row.address,
        walletLabel: row.label,
        createdAt: row.created_at,
      }),
    );
  }

  public async removeByWalletId(userId: number, walletId: number): Promise<boolean> {
    const result = await this.databaseService
      .getDb()
      .deleteFrom('user_wallet_subscriptions')
      .where('user_id', '=', userId)
      .where('wallet_id', '=', walletId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  public async removeByAddress(userId: number, address: string): Promise<boolean> {
    const wallet: TrackedWalletRow | undefined = await this.databaseService
      .getDb()
      .selectFrom('tracked_wallets')
      .selectAll()
      .where('address', '=', address)
      .executeTakeFirst();

    if (!wallet) {
      return false;
    }

    return this.removeByWalletId(userId, wallet.id);
  }

  public async listTrackedAddresses(): Promise<readonly string[]> {
    const rows: readonly { address: string }[] = await this.databaseService
      .getDb()
      .selectFrom('tracked_wallets')
      .innerJoin(
        'user_wallet_subscriptions',
        'user_wallet_subscriptions.wallet_id',
        'tracked_wallets.id',
      )
      .select('tracked_wallets.address')
      .distinct()
      .execute();

    return rows.map((row: { address: string }): string => row.address);
  }

  public async getSubscriberTelegramIdsByAddress(address: string): Promise<readonly string[]> {
    const rows: readonly { telegram_id: string }[] = await this.databaseService
      .getDb()
      .selectFrom('tracked_wallets')
      .innerJoin(
        'user_wallet_subscriptions',
        'user_wallet_subscriptions.wallet_id',
        'tracked_wallets.id',
      )
      .innerJoin('users', 'users.id', 'user_wallet_subscriptions.user_id')
      .select('users.telegram_id')
      .where('tracked_wallets.address', '=', address)
      .execute();

    return rows.map((row: { telegram_id: string }): string => row.telegram_id);
  }
}
