import type { ChainKey } from '../../../core/chains/chain-key.interfaces';

export interface FilterSettingsDto {
  readonly chainKey: ChainKey;
  readonly thresholdUsd: number;
  readonly minAmountUsd: number;
  readonly quietHoursFrom: string | null;
  readonly quietHoursTo: string | null;
  readonly timezone: string;
}
