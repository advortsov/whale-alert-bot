import { Inject, Injectable } from '@nestjs/common';

import { HistoryCacheService } from './history-cache.service';
import { HistoryHotCacheService } from './history-hot-cache.service';
import { HistoryRateLimiterService } from './history-rate-limiter.service';
import { TrackingAddressService } from './tracking-address.service';
import { TrackingHistoryFormatterService } from './tracking-history-formatter.service';
import { TrackingHistoryPageBuilderService } from './tracking-history-page-builder.service';
import { TrackingHistoryPageService } from './tracking-history-page.service';
import { TrackingHistoryQueryParserService } from './tracking-history-query-parser.service';
import { HISTORY_EXPLORER_ADAPTER } from '../../../common/interfaces/explorers/explorer-port.tokens';
import type { IHistoryExplorerAdapter } from '../../../common/interfaces/explorers/history-explorer.interfaces';
import { UsersRepository } from '../../../database/repositories/users.repository';

@Injectable()
export class TrackingHistoryServiceDependencies {
  @Inject(UsersRepository)
  public readonly usersRepository!: UsersRepository;

  @Inject(TrackingAddressService)
  public readonly trackingAddressService!: TrackingAddressService;

  @Inject(HISTORY_EXPLORER_ADAPTER)
  public readonly historyExplorerAdapter!: IHistoryExplorerAdapter;

  @Inject(HistoryCacheService)
  public readonly historyCacheService!: HistoryCacheService;

  @Inject(HistoryRateLimiterService)
  public readonly historyRateLimiterService!: HistoryRateLimiterService;

  @Inject(TrackingHistoryPageService)
  public readonly trackingHistoryPageService!: TrackingHistoryPageService;

  @Inject(TrackingHistoryPageBuilderService)
  public readonly historyPageBuilderService!: TrackingHistoryPageBuilderService;

  @Inject(TrackingHistoryFormatterService)
  public readonly historyFormatter!: TrackingHistoryFormatterService;

  @Inject(TrackingHistoryQueryParserService)
  public readonly historyQueryParserService!: TrackingHistoryQueryParserService;

  @Inject(HistoryHotCacheService)
  public readonly historyHotCacheService!: HistoryHotCacheService;
}
