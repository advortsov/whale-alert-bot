import type { ChainKey } from '../../core/chains/chain-key.interfaces';
import type { AlertSmartFilterType } from '../../features/alerts/smart-filter.interfaces';

export interface UserAlertSettingsUpdatePatch {
  readonly thresholdUsd?: number;
  readonly minAmountUsd?: number;
  readonly smartFilterType?: AlertSmartFilterType;
  readonly includeDexes?: readonly string[];
  readonly excludeDexes?: readonly string[];
  readonly quietFrom?: string | null;
  readonly quietTo?: string | null;
  readonly timezone?: string;
}

export interface UserAlertSettingsLookupKey {
  readonly userId: number;
  readonly chainKey: ChainKey;
}
