import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database.service';
import type {
  NewUserWalletAlertPreferenceRow,
  UserWalletAlertPreferenceRow,
} from '../database.types';
import { AlertEventFilterType } from './user-alert-preferences.interfaces';

@Injectable()
export class UserWalletAlertPreferencesRepository {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async findByUserAndWalletId(
    userId: number,
    walletId: number,
  ): Promise<UserWalletAlertPreferenceRow | null> {
    const row: UserWalletAlertPreferenceRow | undefined = await this.databaseService
      .getDb()
      .selectFrom('user_wallet_alert_preferences')
      .selectAll()
      .where('user_id', '=', userId)
      .where('wallet_id', '=', walletId)
      .executeTakeFirst();

    return row ?? null;
  }

  public async findOrCreateByUserAndWalletId(
    userId: number,
    walletId: number,
  ): Promise<UserWalletAlertPreferenceRow> {
    const insertedRow: UserWalletAlertPreferenceRow | undefined = await this.databaseService
      .getDb()
      .insertInto('user_wallet_alert_preferences')
      .values(this.buildDefaultRow(userId, walletId))
      .onConflict((oc) => oc.columns(['user_id', 'wallet_id']).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (insertedRow) {
      return insertedRow;
    }

    const existingRow: UserWalletAlertPreferenceRow | null = await this.findByUserAndWalletId(
      userId,
      walletId,
    );

    if (!existingRow) {
      throw new Error(
        `Wallet alert preferences for user ${String(userId)} and wallet ${String(walletId)} not found after upsert attempt.`,
      );
    }

    return existingRow;
  }

  public async updateEventType(
    userId: number,
    walletId: number,
    eventType: AlertEventFilterType,
    enabled: boolean,
  ): Promise<UserWalletAlertPreferenceRow> {
    await this.findOrCreateByUserAndWalletId(userId, walletId);

    const updatePatch: {
      readonly allow_transfer?: boolean;
      readonly allow_swap?: boolean;
      readonly updated_at: Date;
    } =
      eventType === AlertEventFilterType.TRANSFER
        ? {
            allow_transfer: enabled,
            updated_at: new Date(),
          }
        : {
            allow_swap: enabled,
            updated_at: new Date(),
          };

    return this.databaseService
      .getDb()
      .updateTable('user_wallet_alert_preferences')
      .set(updatePatch)
      .where('user_id', '=', userId)
      .where('wallet_id', '=', walletId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  private buildDefaultRow(userId: number, walletId: number): NewUserWalletAlertPreferenceRow {
    return {
      user_id: userId,
      wallet_id: walletId,
      allow_transfer: true,
      allow_swap: true,
    };
  }
}
