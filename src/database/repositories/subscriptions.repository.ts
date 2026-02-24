import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import type {
  PopularTrackedWalletView,
  SubscriberWalletRecipient,
  UserWalletSubscriptionView,
} from './subscriptions.repository.interfaces';
import { ChainKey } from '../../common/interfaces/chain-key.interfaces';
import { DatabaseService } from '../kysely/database.service';
import type {
  NewUserWalletSubscriptionRow,
  TrackedWalletRow,
  UserWalletSubscriptionRow,
} from '../types/database.types';

const USER_WALLET_SUBSCRIPTIONS_TABLE = 'user_wallet_subscriptions';
const TRACKED_WALLETS_TABLE = 'tracked_wallets';
const TRACKED_WALLETS_ID_COLUMN = 'tracked_wallets.id';
const TRACKED_WALLETS_ADDRESS_COLUMN = 'tracked_wallets.address';
const TRACKED_WALLETS_LABEL_COLUMN = 'tracked_wallets.label';
const TRACKED_WALLETS_CHAIN_KEY_COLUMN = 'tracked_wallets.chain_key';
const USER_WALLET_SUBSCRIPTIONS_WALLET_ID_COLUMN = 'user_wallet_subscriptions.wallet_id';

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
      .insertInto(USER_WALLET_SUBSCRIPTIONS_TABLE)
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
      chain_key: string;
      address: string;
      label: string | null;
      created_at: Date;
    }[] = await this.databaseService
      .getDb()
      .selectFrom(USER_WALLET_SUBSCRIPTIONS_TABLE)
      .innerJoin(
        TRACKED_WALLETS_TABLE,
        TRACKED_WALLETS_ID_COLUMN,
        USER_WALLET_SUBSCRIPTIONS_WALLET_ID_COLUMN,
      )
      .select([
        'user_wallet_subscriptions.id',
        `${TRACKED_WALLETS_ID_COLUMN} as wallet_id`,
        `${TRACKED_WALLETS_CHAIN_KEY_COLUMN} as chain_key`,
        TRACKED_WALLETS_ADDRESS_COLUMN,
        TRACKED_WALLETS_LABEL_COLUMN,
        'user_wallet_subscriptions.created_at',
      ])
      .where('user_wallet_subscriptions.user_id', '=', userId)
      .orderBy('user_wallet_subscriptions.created_at', 'asc')
      .execute();

    return rows.map(
      (row): UserWalletSubscriptionView => ({
        subscriptionId: row.id,
        walletId: row.wallet_id,
        chainKey: this.normalizeChainKey(row.chain_key),
        walletAddress: row.address,
        walletLabel: row.label,
        createdAt: row.created_at,
      }),
    );
  }

  public async removeByWalletId(userId: number, walletId: number): Promise<boolean> {
    const result = await this.databaseService
      .getDb()
      .deleteFrom(USER_WALLET_SUBSCRIPTIONS_TABLE)
      .where('user_id', '=', userId)
      .where('wallet_id', '=', walletId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  public async removeByAddress(
    userId: number,
    chainKey: ChainKey,
    address: string,
  ): Promise<boolean> {
    const wallet: TrackedWalletRow | undefined = await this.databaseService
      .getDb()
      .selectFrom(TRACKED_WALLETS_TABLE)
      .selectAll()
      .where('chain_key', '=', chainKey)
      .where('address', '=', address)
      .executeTakeFirst();

    if (!wallet) {
      return false;
    }

    return this.removeByWalletId(userId, wallet.id);
  }

  public async listTrackedAddresses(chainKey: ChainKey): Promise<readonly string[]> {
    const rows: readonly { address: string }[] = await this.databaseService
      .getDb()
      .selectFrom(TRACKED_WALLETS_TABLE)
      .innerJoin(
        USER_WALLET_SUBSCRIPTIONS_TABLE,
        USER_WALLET_SUBSCRIPTIONS_WALLET_ID_COLUMN,
        TRACKED_WALLETS_ID_COLUMN,
      )
      .select(TRACKED_WALLETS_ADDRESS_COLUMN)
      .where(TRACKED_WALLETS_CHAIN_KEY_COLUMN, '=', chainKey)
      .distinct()
      .execute();

    return rows.map((row: { address: string }): string => row.address);
  }

  public async listMostPopularTrackedWallets(
    limit: number,
  ): Promise<readonly PopularTrackedWalletView[]> {
    const normalizedLimit: number = Math.max(limit, 1);
    const rows: readonly {
      wallet_id: number;
      chain_key: string;
      address: string;
      subscriber_count: number | bigint;
    }[] = await this.databaseService
      .getDb()
      .selectFrom(TRACKED_WALLETS_TABLE)
      .innerJoin(
        USER_WALLET_SUBSCRIPTIONS_TABLE,
        USER_WALLET_SUBSCRIPTIONS_WALLET_ID_COLUMN,
        TRACKED_WALLETS_ID_COLUMN,
      )
      .select([
        `${TRACKED_WALLETS_ID_COLUMN} as wallet_id`,
        `${TRACKED_WALLETS_CHAIN_KEY_COLUMN} as chain_key`,
        TRACKED_WALLETS_ADDRESS_COLUMN,
      ])
      .select(sql<number>`count(distinct user_wallet_subscriptions.user_id)`.as('subscriber_count'))
      .groupBy([
        TRACKED_WALLETS_ID_COLUMN,
        TRACKED_WALLETS_CHAIN_KEY_COLUMN,
        TRACKED_WALLETS_ADDRESS_COLUMN,
      ])
      .orderBy('subscriber_count', 'desc')
      .orderBy(TRACKED_WALLETS_ID_COLUMN, 'asc')
      .limit(normalizedLimit)
      .execute();

    return rows.map(
      (row): PopularTrackedWalletView => ({
        walletId: row.wallet_id,
        chainKey: this.normalizeChainKey(row.chain_key),
        address: row.address,
        subscriberCount: Number(row.subscriber_count),
      }),
    );
  }

  public async getSubscriberTelegramIdsByAddress(
    chainKey: ChainKey,
    address: string,
  ): Promise<readonly string[]> {
    const rows: readonly { telegram_id: string }[] = await this.databaseService
      .getDb()
      .selectFrom(TRACKED_WALLETS_TABLE)
      .innerJoin(
        USER_WALLET_SUBSCRIPTIONS_TABLE,
        USER_WALLET_SUBSCRIPTIONS_WALLET_ID_COLUMN,
        TRACKED_WALLETS_ID_COLUMN,
      )
      .innerJoin('users', 'users.id', 'user_wallet_subscriptions.user_id')
      .select('users.telegram_id')
      .where(TRACKED_WALLETS_CHAIN_KEY_COLUMN, '=', chainKey)
      .where(TRACKED_WALLETS_ADDRESS_COLUMN, '=', address)
      .execute();

    return rows.map((row: { telegram_id: string }): string => row.telegram_id);
  }

  public async listSubscriberWalletRecipientsByAddress(
    chainKey: ChainKey,
    address: string,
  ): Promise<readonly SubscriberWalletRecipient[]> {
    const rows: readonly {
      telegram_id: string;
      user_id: number;
      wallet_id: number;
      chain_key: string;
    }[] = await this.databaseService
      .getDb()
      .selectFrom(TRACKED_WALLETS_TABLE)
      .innerJoin(
        USER_WALLET_SUBSCRIPTIONS_TABLE,
        USER_WALLET_SUBSCRIPTIONS_WALLET_ID_COLUMN,
        TRACKED_WALLETS_ID_COLUMN,
      )
      .innerJoin('users', 'users.id', 'user_wallet_subscriptions.user_id')
      .select([
        'users.telegram_id',
        'user_wallet_subscriptions.user_id',
        'user_wallet_subscriptions.wallet_id',
        TRACKED_WALLETS_CHAIN_KEY_COLUMN,
      ])
      .where(TRACKED_WALLETS_CHAIN_KEY_COLUMN, '=', chainKey)
      .where(TRACKED_WALLETS_ADDRESS_COLUMN, '=', address)
      .execute();

    return rows.map(
      (row): SubscriberWalletRecipient => ({
        telegramId: row.telegram_id,
        userId: row.user_id,
        walletId: row.wallet_id,
        chainKey: this.normalizeChainKey(row.chain_key),
      }),
    );
  }

  private normalizeChainKey(rawChainKey: string): ChainKey {
    const knownChainKeys: readonly string[] = Object.values(ChainKey);

    if (knownChainKeys.includes(rawChainKey)) {
      return rawChainKey as ChainKey;
    }

    return ChainKey.ETHEREUM_MAINNET;
  }
}
