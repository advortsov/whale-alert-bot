import { describe, expect, it, vi } from 'vitest';

import { AlertMutesRepository } from './alert-mutes.repository';
import { ChainKey } from '../../common/interfaces/chain-key.interfaces';
import type { DatabaseService } from '../kysely/database.service';

type DeleteFromBuilderStub = {
  readonly where: ReturnType<typeof vi.fn>;
};

type DatabaseStub = {
  readonly deleteFrom: ReturnType<typeof vi.fn>;
};

type DatabaseServiceStub = {
  readonly getDb: ReturnType<typeof vi.fn>;
};

describe('AlertMutesRepository', (): void => {
  it('returns true when delete affected at least one row', async (): Promise<void> => {
    const executeTakeFirst = vi.fn().mockResolvedValue({ numDeletedRows: 1n });
    const whereWallet = vi.fn().mockReturnValue({ executeTakeFirst });
    const whereChain = vi.fn().mockReturnValue({ where: whereWallet });
    const whereUser = vi.fn().mockReturnValue({ where: whereChain });
    const deleteFrom = vi
      .fn()
      .mockReturnValue({ where: whereUser } satisfies DeleteFromBuilderStub);
    const dbStub: DatabaseStub = { deleteFrom };
    const databaseServiceStub: DatabaseServiceStub = {
      getDb: vi.fn().mockReturnValue(dbStub),
    };
    const repository: AlertMutesRepository = new AlertMutesRepository(
      databaseServiceStub as unknown as DatabaseService,
    );

    const removed: boolean = await repository.deleteMute({
      userId: 7,
      chainKey: ChainKey.ETHEREUM_MAINNET,
      walletId: 16,
    });

    expect(deleteFrom).toHaveBeenCalledWith('alert_mutes');
    expect(whereUser).toHaveBeenCalledWith('user_id', '=', 7);
    expect(whereChain).toHaveBeenCalledWith('chain_key', '=', ChainKey.ETHEREUM_MAINNET);
    expect(whereWallet).toHaveBeenCalledWith('wallet_id', '=', 16);
    expect(removed).toBe(true);
  });

  it('returns false when delete affected zero rows', async (): Promise<void> => {
    const executeTakeFirst = vi.fn().mockResolvedValue({ numDeletedRows: 0n });
    const whereWallet = vi.fn().mockReturnValue({ executeTakeFirst });
    const whereChain = vi.fn().mockReturnValue({ where: whereWallet });
    const whereUser = vi.fn().mockReturnValue({ where: whereChain });
    const deleteFrom = vi
      .fn()
      .mockReturnValue({ where: whereUser } satisfies DeleteFromBuilderStub);
    const dbStub: DatabaseStub = { deleteFrom };
    const databaseServiceStub: DatabaseServiceStub = {
      getDb: vi.fn().mockReturnValue(dbStub),
    };
    const repository: AlertMutesRepository = new AlertMutesRepository(
      databaseServiceStub as unknown as DatabaseService,
    );

    const removed: boolean = await repository.deleteMute({
      userId: 7,
      chainKey: ChainKey.TRON_MAINNET,
      walletId: 18,
    });

    expect(removed).toBe(false);
  });
});
