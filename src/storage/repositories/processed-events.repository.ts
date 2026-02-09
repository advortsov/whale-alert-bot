import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database.service';
import type { NewProcessedEventRow } from '../database.types';

export type ProcessedEventKey = {
  readonly txHash: string;
  readonly logIndex: number;
  readonly chainId: number;
  readonly chainKey: string;
  readonly trackedAddress: string;
};

@Injectable()
export class ProcessedEventsRepository {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async hasProcessed(key: ProcessedEventKey): Promise<boolean> {
    const row: { id: number } | undefined = await this.databaseService
      .getDb()
      .selectFrom('processed_events')
      .select('id')
      .where('tx_hash', '=', key.txHash)
      .where('log_index', '=', key.logIndex)
      .where('chain_key', '=', key.chainKey)
      .where('tracked_address', '=', key.trackedAddress)
      .executeTakeFirst();

    return Boolean(row);
  }

  public async markProcessed(key: ProcessedEventKey): Promise<void> {
    const payload: NewProcessedEventRow = {
      tx_hash: key.txHash,
      log_index: key.logIndex,
      chain_id: key.chainId,
      chain_key: key.chainKey,
      tracked_address: key.trackedAddress,
    };

    await this.databaseService
      .getDb()
      .insertInto('processed_events')
      .values(payload)
      .onConflict((oc) =>
        oc.columns(['tx_hash', 'log_index', 'chain_key', 'tracked_address']).doNothing(),
      )
      .execute();
  }
}
