import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database.service';
import type { ChainCheckpointRow, NewChainCheckpointRow } from '../database.types';

@Injectable()
export class ChainCheckpointsRepository {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async getLastProcessedBlock(chainId: number): Promise<number | null> {
    const row: ChainCheckpointRow | undefined = await this.databaseService
      .getDb()
      .selectFrom('chain_checkpoints')
      .selectAll()
      .where('chain_id', '=', chainId)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return Number.parseInt(row.last_processed_block, 10);
  }

  public async saveLastProcessedBlock(chainId: number, blockNumber: number): Promise<void> {
    const payload: NewChainCheckpointRow = {
      chain_id: chainId,
      last_processed_block: String(blockNumber),
      updated_at: new Date(),
    };

    await this.databaseService
      .getDb()
      .insertInto('chain_checkpoints')
      .values(payload)
      .onConflict((oc) =>
        oc.column('chain_id').doUpdateSet({
          last_processed_block: String(blockNumber),
          updated_at: new Date(),
        }),
      )
      .execute();
  }
}
