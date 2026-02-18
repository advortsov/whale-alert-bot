import { Injectable } from '@nestjs/common';

import { AlertEventFilterType } from './user-alert-preferences.interfaces';
import { DatabaseService } from '../kysely/database.service';
import type { NewUserAlertPreferenceRow, UserAlertPreferenceRow } from '../types/database.types';

@Injectable()
export class UserAlertPreferencesRepository {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async findByUserId(userId: number): Promise<UserAlertPreferenceRow | null> {
    const row: UserAlertPreferenceRow | undefined = await this.databaseService
      .getDb()
      .selectFrom('user_alert_preferences')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return row ?? null;
  }

  public async findOrCreateByUserId(userId: number): Promise<UserAlertPreferenceRow> {
    const insertedRow: UserAlertPreferenceRow | undefined = await this.databaseService
      .getDb()
      .insertInto('user_alert_preferences')
      .values(this.buildDefaultRow(userId))
      .onConflict((oc) => oc.column('user_id').doNothing())
      .returningAll()
      .executeTakeFirst();

    if (insertedRow) {
      return insertedRow;
    }

    const existingRow: UserAlertPreferenceRow | null = await this.findByUserId(userId);

    if (!existingRow) {
      throw new Error(
        `Alert preferences for user ${String(userId)} not found after upsert attempt.`,
      );
    }

    return existingRow;
  }

  public async updateMinAmount(userId: number, minAmount: number): Promise<UserAlertPreferenceRow> {
    await this.findOrCreateByUserId(userId);

    return this.databaseService
      .getDb()
      .updateTable('user_alert_preferences')
      .set({
        min_amount: minAmount,
        updated_at: new Date(),
      })
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  public async updateMute(
    userId: number,
    mutedUntil: Date | null,
  ): Promise<UserAlertPreferenceRow> {
    await this.findOrCreateByUserId(userId);

    return this.databaseService
      .getDb()
      .updateTable('user_alert_preferences')
      .set({
        muted_until: mutedUntil,
        updated_at: new Date(),
      })
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  public async updateEventType(
    userId: number,
    eventType: AlertEventFilterType,
    enabled: boolean,
  ): Promise<UserAlertPreferenceRow> {
    await this.findOrCreateByUserId(userId);

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
      .updateTable('user_alert_preferences')
      .set(updatePatch)
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  private buildDefaultRow(userId: number): NewUserAlertPreferenceRow {
    return {
      user_id: userId,
      min_amount: 0,
      allow_transfer: true,
      allow_swap: true,
      muted_until: null,
    };
  }
}
