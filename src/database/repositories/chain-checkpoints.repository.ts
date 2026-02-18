import { Injectable } from '@nestjs/common';

import type { ChainKey } from '../../common/interfaces/chain-key.interfaces';
import { DatabaseService } from '../kysely/database.service';
import type { ChainCheckpointRow, NewChainCheckpointRow } from '../types/database.types';

@Injectable()
export class ChainCheckpointsRepository {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async getLastProcessedBlock(chainKey: ChainKey): Promise<number | null> {
    const row: ChainCheckpointRow | undefined = await this.databaseService
      .getDb()
      .selectFrom('chain_checkpoints')
      .selectAll()
      .where('chain_key', '=', chainKey)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return Number.parseInt(row.last_processed_block, 10);
  }

  public async saveLastProcessedBlock(
    chainKey: ChainKey,
    chainId: number,
    blockNumber: number,
  ): Promise<void> {
    const payload: NewChainCheckpointRow = {
      chain_id: chainId,
      chain_key: chainKey,
      last_processed_block: String(blockNumber),
      updated_at: new Date(),
    };

    await this.databaseService
      .getDb()
      .insertInto('chain_checkpoints')
      .values(payload)
      .onConflict((oc) =>
        oc.column('chain_key').doUpdateSet({
          chain_id: chainId,
          last_processed_block: String(blockNumber),
          updated_at: new Date(),
        }),
      )
      .execute();
  }
}
