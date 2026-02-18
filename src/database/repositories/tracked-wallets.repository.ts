import { Injectable } from '@nestjs/common';

import type { ChainKey } from '../../common/interfaces/chain-key.interfaces';
import { DatabaseService } from '../kysely/database.service';
import type { NewTrackedWalletRow, TrackedWalletRow } from '../types/database.types';

@Injectable()
export class TrackedWalletsRepository {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async findByAddress(
    chainKey: ChainKey,
    address: string,
  ): Promise<TrackedWalletRow | null> {
    const trackedWallet: TrackedWalletRow | undefined = await this.databaseService
      .getDb()
      .selectFrom('tracked_wallets')
      .selectAll()
      .where('chain_key', '=', chainKey)
      .where('address', '=', address)
      .executeTakeFirst();

    return trackedWallet ?? null;
  }

  public async create(input: NewTrackedWalletRow): Promise<TrackedWalletRow> {
    return this.databaseService
      .getDb()
      .insertInto('tracked_wallets')
      .values(input)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  public async findOrCreate(
    chainKey: ChainKey,
    address: string,
    label: string | null,
  ): Promise<TrackedWalletRow> {
    const insertedWallet: TrackedWalletRow | undefined = await this.databaseService
      .getDb()
      .insertInto('tracked_wallets')
      .values({
        chain_key: chainKey,
        address,
        label,
      })
      .onConflict((oc) => oc.columns(['chain_key', 'address']).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (insertedWallet) {
      return insertedWallet;
    }

    const existingWallet: TrackedWalletRow | null = await this.findByAddress(chainKey, address);

    if (!existingWallet) {
      throw new Error(`Wallet ${address} was not found after upsert attempt.`);
    }

    if (!existingWallet.label && label) {
      const updatedWallet: TrackedWalletRow = await this.databaseService
        .getDb()
        .updateTable('tracked_wallets')
        .set({ label })
        .where('id', '=', existingWallet.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return updatedWallet;
    }

    return existingWallet;
  }
}
