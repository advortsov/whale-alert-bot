import { Injectable } from '@nestjs/common';

import type { IParsedHistoryQueryParams } from './dto/tracking-history-request.dto';
import { HistoryDirectionFilter, HistoryKind } from '../features/tracking/dto/history-request.dto';

const DEFAULT_HISTORY_LIMIT = 5;
const MAX_HISTORY_LIMIT = 20;
const MAX_HISTORY_OFFSET = 10_000;

@Injectable()
export class TrackingHistoryQueryParserService {
  public parseHistoryParams(request: {
    readonly rawLimit: string | null;
    readonly rawOffset: string | null;
    readonly rawKind: string | null;
    readonly rawDirection: string | null;
  }): IParsedHistoryQueryParams {
    return {
      limit: this.parseHistoryLimit(request.rawLimit),
      offset: this.parseHistoryOffset(request.rawOffset),
      kind: this.parseHistoryKind(request.rawKind),
      direction: this.parseHistoryDirection(request.rawDirection),
    };
  }

  private parseHistoryLimit(rawLimit: string | null): number {
    if (!rawLimit) {
      return DEFAULT_HISTORY_LIMIT;
    }

    const normalizedValue: string = rawLimit.trim();

    if (!/^\d+$/.test(normalizedValue)) {
      throw new Error(
        `Неверный limit "${rawLimit}". Используй число от 1 до ${MAX_HISTORY_LIMIT}.`,
      );
    }

    const limit: number = Number.parseInt(normalizedValue, 10);

    if (limit < 1 || limit > MAX_HISTORY_LIMIT) {
      throw new Error(
        `Неверный limit "${rawLimit}". Используй число от 1 до ${MAX_HISTORY_LIMIT}.`,
      );
    }

    return limit;
  }

  private parseHistoryOffset(rawOffset: string | null): number {
    if (!rawOffset) {
      return 0;
    }

    const normalizedValue: string = rawOffset.trim();

    if (!/^\d+$/.test(normalizedValue)) {
      throw new Error(`Неверный offset "${rawOffset}". Используй целое число >= 0.`);
    }

    const offset: number = Number.parseInt(normalizedValue, 10);

    if (offset < 0 || offset > MAX_HISTORY_OFFSET) {
      throw new Error(`Неверный offset "${rawOffset}". Используй значение от 0 до 10000.`);
    }

    return offset;
  }

  private parseHistoryKind(rawKind: string | null): HistoryKind {
    const normalizedKind: string = (rawKind ?? 'all').trim().toLowerCase();

    if (normalizedKind === 'all') {
      return HistoryKind.ALL;
    }

    if (normalizedKind === 'eth') {
      return HistoryKind.ETH;
    }

    if (normalizedKind === 'erc20') {
      return HistoryKind.ERC20;
    }

    throw new Error('Неверный kind. Используй all|eth|erc20.');
  }

  private parseHistoryDirection(rawDirection: string | null): HistoryDirectionFilter {
    const normalizedDirection: string = (rawDirection ?? 'all').trim().toLowerCase();

    if (normalizedDirection === 'all') {
      return HistoryDirectionFilter.ALL;
    }

    if (normalizedDirection === 'in') {
      return HistoryDirectionFilter.IN;
    }

    if (normalizedDirection === 'out') {
      return HistoryDirectionFilter.OUT;
    }

    throw new Error('Неверный direction. Используй all|in|out.');
  }
}
