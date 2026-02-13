import type { ChainKey } from '../../../core/chains/chain-key.interfaces';
import type { AlertCexFlowMode } from '../../alerts/cex-flow.interfaces';
import type { AlertSmartFilterType } from '../../alerts/smart-filter.interfaces';

export interface IFilterSettingsDto {
  readonly chainKey: ChainKey;
  readonly thresholdUsd: number;
  readonly minAmountUsd: number;
  readonly cexFlowMode: AlertCexFlowMode;
  readonly smartFilterType: AlertSmartFilterType;
  readonly includeDexes: readonly string[];
  readonly excludeDexes: readonly string[];
  readonly quietHoursFrom: string | null;
  readonly quietHoursTo: string | null;
  readonly timezone: string;
}
