import { describe, expect, it, vi } from 'vitest';

import { WalletEventsRepository } from './wallet-events.repository';
import {
  AssetStandard,
  ChainId,
  type ClassifiedEvent,
  ClassifiedEventType,
  EventDirection,
} from '../../common/interfaces/chain.types';
import type { DatabaseService } from '../kysely/database.service';

type CountBuilderStub = {
  readonly innerJoin: ReturnType<typeof vi.fn>;
  readonly select: ReturnType<typeof vi.fn>;
  readonly where: ReturnType<typeof vi.fn>;
  readonly executeTakeFirst: ReturnType<typeof vi.fn>;
};

type InsertBuilderStub = {
  readonly values: ReturnType<typeof vi.fn>;
};

type DatabaseStub = {
  readonly selectFrom: ReturnType<typeof vi.fn>;
  readonly insertInto: ReturnType<typeof vi.fn>;
};

type DatabaseServiceStub = {
  readonly getDb: ReturnType<typeof vi.fn>;
};

describe('WalletEventsRepository', (): void => {
  it('counts today events by user with join-based query', async (): Promise<void> => {
    const executeTakeFirst = vi.fn().mockResolvedValue({ total: 5n });
    const where = vi.fn();
    const select = vi.fn();
    const innerJoin = vi.fn();
    const countBuilder: CountBuilderStub = {
      innerJoin,
      select,
      where,
      executeTakeFirst,
    };
    innerJoin.mockReturnValue(countBuilder);
    select.mockReturnValue(countBuilder);
    where
      .mockReturnValueOnce(countBuilder)
      .mockReturnValueOnce(countBuilder)
      .mockReturnValueOnce(countBuilder);
    const selectFrom = vi.fn().mockReturnValue(countBuilder);
    const dbStub: DatabaseStub = {
      selectFrom,
      insertInto: vi.fn(),
    };
    const databaseServiceStub: DatabaseServiceStub = {
      getDb: vi.fn().mockReturnValue(dbStub),
    };
    const repository: WalletEventsRepository = new WalletEventsRepository(
      databaseServiceStub as unknown as DatabaseService,
    );

    const total: number = await repository.countTodayEventsByUser(42);

    expect(selectFrom).toHaveBeenCalledWith('user_wallet_subscriptions');
    expect(where).toHaveBeenNthCalledWith(1, 'user_wallet_subscriptions.user_id', '=', 42);
    expect(where).toHaveBeenNthCalledWith(2, 'wallet_events.occurred_at', '>=', expect.any(Date));
    expect(total).toBe(5);
  });

  it('stores tron tracked address and counterparty without lowercase normalization', async (): Promise<void> => {
    const executeTakeFirst = vi.fn().mockResolvedValue(undefined);
    const columns = vi.fn().mockReturnValue({
      doNothing: vi.fn(),
    });
    const onConflict = vi.fn().mockImplementation((conflictHandler: (oc: unknown) => unknown) => {
      conflictHandler({
        columns,
      });
      return {
        executeTakeFirst,
      };
    });
    const values = vi.fn().mockReturnValue({
      onConflict,
    });
    const insertInto = vi.fn().mockReturnValue({
      values,
    } satisfies InsertBuilderStub);
    const dbStub: DatabaseStub = {
      selectFrom: vi.fn(),
      insertInto,
    };
    const databaseServiceStub: DatabaseServiceStub = {
      getDb: vi.fn().mockReturnValue(dbStub),
    };
    const repository: WalletEventsRepository = new WalletEventsRepository(
      databaseServiceStub as unknown as DatabaseService,
    );
    const event: ClassifiedEvent = {
      chainId: ChainId.TRON_MAINNET,
      txHash: 'tx-1',
      logIndex: 0,
      trackedAddress: 'TEDVku9LrQDLdbg1ik6HrRtK6Uimg8epSV',
      eventType: ClassifiedEventType.TRANSFER,
      direction: EventDirection.OUT,
      assetStandard: AssetStandard.NATIVE,
      contractAddress: null,
      tokenAddress: null,
      tokenSymbol: 'TRX',
      tokenDecimals: 6,
      tokenAmountRaw: '1000000',
      valueFormatted: '1.000000',
      counterpartyAddress: 'TEDVku9LrQDLdbg1ik6HrRtK6Uimg8epSV',
      dex: null,
      pair: null,
      usdPrice: null,
      usdAmount: null,
      usdUnavailable: true,
      swapFromSymbol: null,
      swapFromAmountText: null,
      swapToSymbol: null,
      swapToAmountText: null,
    };

    await repository.saveEvent({
      event,
      occurredAt: new Date('2026-02-23T00:00:00.000Z'),
    });

    expect(insertInto).toHaveBeenCalledWith('wallet_events');
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        tracked_address: 'TEDVku9LrQDLdbg1ik6HrRtK6Uimg8epSV',
        counterparty_address: 'TEDVku9LrQDLdbg1ik6HrRtK6Uimg8epSV',
      }),
    );
  });
});
