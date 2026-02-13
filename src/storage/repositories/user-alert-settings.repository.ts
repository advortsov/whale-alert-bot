import { Injectable } from '@nestjs/common';

import type { ChainKey } from '../../core/chains/chain-key.interfaces';
import { AlertCexFlowMode } from '../../features/alerts/cex-flow.interfaces';
import { AlertSmartFilterType } from '../../features/alerts/smart-filter.interfaces';
import { DatabaseService } from '../database.service';
import type { NewUserAlertSettingsRow, UserAlertSettingsRow } from '../database.types';
import type { IUserAlertSettingsUpdatePatch } from './user-alert-settings.repository.interfaces';

@Injectable()
export class UserAlertSettingsRepository {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async findByUserAndChain(
    userId: number,
    chainKey: ChainKey,
  ): Promise<UserAlertSettingsRow | null> {
    const row: UserAlertSettingsRow | undefined = await this.databaseService
      .getDb()
      .selectFrom('user_alert_settings')
      .selectAll()
      .where('user_id', '=', userId)
      .where('chain_key', '=', chainKey)
      .executeTakeFirst();

    return row ?? null;
  }

  public async findOrCreateByUserAndChain(
    userId: number,
    chainKey: ChainKey,
  ): Promise<UserAlertSettingsRow> {
    const insertedRow: UserAlertSettingsRow | undefined = await this.databaseService
      .getDb()
      .insertInto('user_alert_settings')
      .values(this.buildDefaultRow(userId, chainKey))
      .onConflict((oc) => oc.columns(['user_id', 'chain_key']).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (insertedRow) {
      return insertedRow;
    }

    const existingRow: UserAlertSettingsRow | null = await this.findByUserAndChain(
      userId,
      chainKey,
    );

    if (!existingRow) {
      throw new Error(
        `Alert settings for user ${String(userId)} and chain ${chainKey} not found after upsert.`,
      );
    }

    return existingRow;
  }

  public async updateByUserAndChain(
    userId: number,
    chainKey: ChainKey,
    patch: IUserAlertSettingsUpdatePatch,
  ): Promise<UserAlertSettingsRow> {
    await this.findOrCreateByUserAndChain(userId, chainKey);

    const updatePatch: {
      threshold_usd?: number;
      min_amount_usd?: number;
      cex_flow_mode?: string;
      smart_filter_type?: string;
      include_dexes?: string[];
      exclude_dexes?: string[];
      quiet_from?: string | null;
      quiet_to?: string | null;
      timezone?: string;
      updated_at: Date;
    } = {
      updated_at: new Date(),
    };

    if (patch.thresholdUsd !== undefined) {
      updatePatch.threshold_usd = patch.thresholdUsd;
    }

    if (patch.minAmountUsd !== undefined) {
      updatePatch.min_amount_usd = patch.minAmountUsd;
    }

    if (patch.cexFlowMode !== undefined) {
      updatePatch.cex_flow_mode = patch.cexFlowMode;
    }

    if (patch.smartFilterType !== undefined) {
      updatePatch.smart_filter_type = patch.smartFilterType;
    }

    if (patch.includeDexes !== undefined) {
      updatePatch.include_dexes = [...patch.includeDexes];
    }

    if (patch.excludeDexes !== undefined) {
      updatePatch.exclude_dexes = [...patch.excludeDexes];
    }

    if (patch.quietFrom !== undefined) {
      updatePatch.quiet_from = patch.quietFrom;
    }

    if (patch.quietTo !== undefined) {
      updatePatch.quiet_to = patch.quietTo;
    }

    if (patch.timezone !== undefined) {
      updatePatch.timezone = patch.timezone;
    }

    return this.databaseService
      .getDb()
      .updateTable('user_alert_settings')
      .set(updatePatch)
      .where('user_id', '=', userId)
      .where('chain_key', '=', chainKey)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  private buildDefaultRow(userId: number, chainKey: ChainKey): NewUserAlertSettingsRow {
    return {
      user_id: userId,
      chain_key: chainKey,
      threshold_usd: 0,
      min_amount_usd: 0,
      cex_flow_mode: AlertCexFlowMode.OFF,
      smart_filter_type: AlertSmartFilterType.ALL,
      include_dexes: [],
      exclude_dexes: [],
      quiet_from: null,
      quiet_to: null,
      timezone: 'UTC',
    };
  }
}
