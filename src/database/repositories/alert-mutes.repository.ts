import { Injectable } from '@nestjs/common';

import type { IUpsertAlertMuteInput } from './alert-mutes.repository.interfaces';
import type { ChainKey } from '../../common/interfaces/chain-key.interfaces';
import { DatabaseService } from '../kysely/database.service';
import type { AlertMuteRow, NewAlertMuteRow } from '../types/database.types';

@Injectable()
export class AlertMutesRepository {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async upsertMute(input: IUpsertAlertMuteInput): Promise<AlertMuteRow> {
    const insertRow: NewAlertMuteRow = {
      user_id: input.userId,
      chain_key: input.chainKey,
      wallet_id: input.walletId,
      mute_until: input.muteUntil,
      source: input.source,
    };

    const insertedRow: AlertMuteRow | undefined = await this.databaseService
      .getDb()
      .insertInto('alert_mutes')
      .values(insertRow)
      .onConflict((oc) =>
        oc.columns(['user_id', 'chain_key', 'wallet_id']).doUpdateSet({
          mute_until: input.muteUntil,
          source: input.source,
        }),
      )
      .returningAll()
      .executeTakeFirst();

    if (!insertedRow) {
      throw new Error('Alert mute upsert returned empty result.');
    }

    return insertedRow;
  }

  public async findActiveMute(
    userId: number,
    chainKey: ChainKey,
    walletId: number,
    now: Date = new Date(),
  ): Promise<AlertMuteRow | null> {
    const row: AlertMuteRow | undefined = await this.databaseService
      .getDb()
      .selectFrom('alert_mutes')
      .selectAll()
      .where('user_id', '=', userId)
      .where('chain_key', '=', chainKey)
      .where('wallet_id', '=', walletId)
      .where('mute_until', '>', now)
      .executeTakeFirst();

    return row ?? null;
  }
}
