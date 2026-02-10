import { Injectable } from '@nestjs/common';

import { ChainKey } from '../../core/chains/chain-key.interfaces';
import { DatabaseService } from '../database.service';
import type { NewWalletEventRow } from '../database.types';
import type {
  SaveWalletEventInput,
  WalletEventHistoryView,
} from './wallet-events.repository.interfaces';

@Injectable()
export class WalletEventsRepository {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async saveEvent(input: SaveWalletEventInput): Promise<void> {
    const { event, occurredAt } = input;
    const insertRow: NewWalletEventRow = {
      chain_id: event.chainId,
      chain_key: this.mapChainIdToChainKey(event.chainId),
      tx_hash: event.txHash,
      log_index: event.logIndex,
      tracked_address: event.trackedAddress.toLowerCase(),
      event_type: event.eventType,
      direction: event.direction,
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
    const rows: readonly {
      chain_id: number;
      chain_key: string;
      tx_hash: string;
      log_index: number;
      tracked_address: string;
      event_type: string;
      direction: string;
      contract_address: string | null;
      token_address: string | null;
      token_symbol: string | null;
      token_decimals: number | null;
      token_amount_raw: string | null;
      value_formatted: string | null;
      dex: string | null;
      pair: string | null;
      occurred_at: Date;
    }[] = await this.databaseService
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
      .where('chain_key', '=', chainKey)
      .where('tracked_address', '=', trackedAddress.toLowerCase())
      .orderBy('occurred_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map(
      (row): WalletEventHistoryView => ({
        chainId: row.chain_id,
        chainKey: row.chain_key,
        txHash: row.tx_hash,
        logIndex: row.log_index,
        trackedAddress: row.tracked_address,
        eventType: row.event_type,
        direction: row.direction,
        contractAddress: row.contract_address,
        tokenAddress: row.token_address,
        tokenSymbol: row.token_symbol,
        tokenDecimals: row.token_decimals,
        tokenAmountRaw: row.token_amount_raw,
        valueFormatted: row.value_formatted,
        dex: row.dex,
        pair: row.pair,
        occurredAt: row.occurred_at,
      }),
    );
  }

  private mapChainIdToChainKey(chainId: number): ChainKey {
    if (chainId === 1) {
      return ChainKey.ETHEREUM_MAINNET;
    }

    if (chainId === 101) {
      return ChainKey.SOLANA_MAINNET;
    }

    return ChainKey.ETHEREUM_MAINNET;
  }
}
