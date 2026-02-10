import type { ChainKey } from '../../core/chains/chain-key.interfaces';

export interface UserAlertSettingsUpdatePatch {
  readonly thresholdUsd?: number;
  readonly minAmountUsd?: number;
  readonly quietFrom?: string | null;
  readonly quietTo?: string | null;
  readonly timezone?: string;
}

export interface UserAlertSettingsLookupKey {
  readonly userId: number;
  readonly chainKey: ChainKey;
}
