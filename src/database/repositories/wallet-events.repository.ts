import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import type {
  SaveWalletEventInput,
  WalletEventHistoryView,
} from './wallet-events.repository.interfaces';
import { ChainKey } from '../../common/interfaces/chain-key.interfaces';
import { ChainId } from '../../common/interfaces/chain.types';
import { DatabaseService } from '../kysely/database.service';
import type { NewWalletEventRow } from '../types/database.types';

type WalletEventHistoryRow = {
  readonly chain_id: number;
  readonly chain_key: string;
  readonly tx_hash: string;
  readonly log_index: number;
  readonly tracked_address: string;
  readonly event_type: string;
  readonly direction: string;
  readonly asset_standard: string;
  readonly contract_address: string | null;
  readonly token_address: string | null;
  readonly token_symbol: string | null;
  readonly token_decimals: number | null;
  readonly token_amount_raw: string | null;
  readonly value_formatted: string | null;
  readonly dex: string | null;
  readonly pair: string | null;
  readonly occurred_at: Date;
};

@Injectable()
export class WalletEventsRepository {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async countTodayEventsByUser(userId: number): Promise<number> {
    const utcDayStart: Date = new Date();
    utcDayStart.setUTCHours(0, 0, 0, 0);

    const row:
      | {
          total: number | string | bigint;
        }
      | undefined = await this.databaseService
      .getDb()
      .selectFrom('user_wallet_subscriptions')
      .innerJoin('tracked_wallets', 'tracked_wallets.id', 'user_wallet_subscriptions.wallet_id')
      .innerJoin('wallet_events', 'wallet_events.chain_key', 'tracked_wallets.chain_key')
      .select((expressionBuilder) => expressionBuilder.fn.count('wallet_events.id').as('total'))
      .where('user_wallet_subscriptions.user_id', '=', userId)
      .where('wallet_events.occurred_at', '>=', utcDayStart)
      .where(sql<boolean>`lower(wallet_events.tracked_address) = lower(tracked_wallets.address)`)
      .executeTakeFirst();

    return Number(row?.total ?? 0);
  }

  public async saveEvent(input: SaveWalletEventInput): Promise<void> {
    const { event, occurredAt } = input;
    const chainKey: ChainKey = this.mapChainIdToChainKey(event.chainId);
    const insertRow: NewWalletEventRow = {
      chain_id: event.chainId,
      chain_key: chainKey,
      tx_hash: event.txHash,
      log_index: event.logIndex,
      tracked_address: this.normalizeTrackedAddressForStorage(chainKey, event.trackedAddress),
      event_type: event.eventType,
      direction: event.direction,
      asset_standard: event.assetStandard,
      contract_address: event.contractAddress,
      token_address: event.tokenAddress,
      token_symbol: event.tokenSymbol,
      token_decimals: event.tokenDecimals,
      token_amount_raw: event.tokenAmountRaw,
      value_formatted: event.valueFormatted,
      dex: event.dex,
      pair: event.pair,
      occurred_at: occurredAt,
    };

    await this.databaseService
      .getDb()
      .insertInto('wallet_events')
      .values(insertRow)
      .onConflict((oc) =>
        oc.columns(['tx_hash', 'log_index', 'chain_key', 'tracked_address']).doNothing(),
      )
      .executeTakeFirst();
  }

  public async listRecentByTrackedAddress(
    chainKey: ChainKey,
    trackedAddress: string,
    limit: number,
    offset: number = 0,
  ): Promise<readonly WalletEventHistoryView[]> {
    const trackedAddressCandidates: readonly string[] = this.resolveTrackedAddressCandidates(
      chainKey,
      trackedAddress,
    );
    const rows: readonly WalletEventHistoryRow[] = await this.loadHistoryRows(
      chainKey,
      trackedAddressCandidates,
      limit,
      offset,
    );

    return rows.map(
      (row: WalletEventHistoryRow): WalletEventHistoryView => this.mapRowToHistoryView(row),
    );
  }

  private mapChainIdToChainKey(chainId: ChainId): ChainKey {
    if (chainId === ChainId.ETHEREUM_MAINNET) {
      return ChainKey.ETHEREUM_MAINNET;
    }

    if (chainId === ChainId.SOLANA_MAINNET) {
      return ChainKey.SOLANA_MAINNET;
    }

    return ChainKey.TRON_MAINNET;
  }

  private normalizeTrackedAddressForStorage(chainKey: ChainKey, trackedAddress: string): string {
    const normalizedAddress: string = trackedAddress.trim();

    if (chainKey === ChainKey.ETHEREUM_MAINNET) {
      return normalizedAddress.toLowerCase();
    }

    return normalizedAddress;
  }

  private resolveTrackedAddressCandidates(
    chainKey: ChainKey,
    trackedAddress: string,
  ): readonly string[] {
    const normalizedAddress: string = this.normalizeTrackedAddressForStorage(
      chainKey,
      trackedAddress,
    );

    if (chainKey === ChainKey.ETHEREUM_MAINNET) {
      return [normalizedAddress];
    }

    const legacyLowercaseAddress: string = trackedAddress.trim().toLowerCase();

    if (legacyLowercaseAddress === normalizedAddress) {
      return [normalizedAddress];
    }

    return [normalizedAddress, legacyLowercaseAddress];
  }

  private async loadHistoryRows(
    chainKey: ChainKey,
    trackedAddressCandidates: readonly string[],
    limit: number,
    offset: number,
  ): Promise<readonly WalletEventHistoryRow[]> {
    let query = this.databaseService
      .getDb()
      .selectFrom('wallet_events')
      .select([
        'chain_id',
        'chain_key',
        'tx_hash',
        'log_index',
        'tracked_address',
        'event_type',
        'direction',
        'asset_standard',
        'contract_address',
        'token_address',
        'token_symbol',
        'token_decimals',
        'token_amount_raw',
        'value_formatted',
        'dex',
        'pair',
        'occurred_at',
      ])
      .where('chain_key', '=', chainKey);

    if (trackedAddressCandidates.length === 1) {
      query = query.where('tracked_address', '=', trackedAddressCandidates[0] ?? '');
    } else {
      query = query.where('tracked_address', 'in', trackedAddressCandidates);
    }

    return query.orderBy('occurred_at', 'desc').limit(limit).offset(offset).execute();
  }

  private mapRowToHistoryView(row: WalletEventHistoryRow): WalletEventHistoryView {
    return {
      chainId: row.chain_id,
      chainKey: row.chain_key,
      txHash: row.tx_hash,
      logIndex: row.log_index,
      trackedAddress: row.tracked_address,
      eventType: row.event_type,
      direction: row.direction,
      assetStandard: row.asset_standard,
      contractAddress: row.contract_address,
      tokenAddress: row.token_address,
      tokenSymbol: row.token_symbol,
      tokenDecimals: row.token_decimals,
      tokenAmountRaw: row.token_amount_raw,
      valueFormatted: row.value_formatted,
      dex: row.dex,
      pair: row.pair,
      occurredAt: row.occurred_at,
    };
  }
}
