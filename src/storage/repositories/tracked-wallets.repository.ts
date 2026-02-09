import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database.service';
import type { NewTrackedWalletRow, TrackedWalletRow } from '../database.types';

@Injectable()
export class TrackedWalletsRepository {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async findByAddress(address: string): Promise<TrackedWalletRow | null> {
    const trackedWallet: TrackedWalletRow | undefined = await this.databaseService
      .getDb()
      .selectFrom('tracked_wallets')
      .selectAll()
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

  public async findOrCreate(address: string, label: string | null): Promise<TrackedWalletRow> {
    const insertedWallet: TrackedWalletRow | undefined = await this.databaseService
      .getDb()
      .insertInto('tracked_wallets')
      .values({
        address,
        label,
      })
      .onConflict((oc) => oc.column('address').doNothing())
      .returningAll()
      .executeTakeFirst();

    if (insertedWallet) {
      return insertedWallet;
    }

    const existingWallet: TrackedWalletRow | null = await this.findByAddress(address);

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
