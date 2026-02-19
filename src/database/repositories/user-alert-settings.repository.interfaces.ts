import type { AlertCexFlowMode } from '../../modules/whales/entities/cex-flow.interfaces';
import type { AlertSmartFilterType } from '../../modules/whales/entities/smart-filter.interfaces';

export interface IUserAlertSettingsUpdatePatch {
  readonly thresholdUsd?: number;
  readonly minAmountUsd?: number;
  readonly cexFlowMode?: AlertCexFlowMode;
  readonly smartFilterType?: AlertSmartFilterType;
  readonly includeDexes?: readonly string[];
  readonly excludeDexes?: readonly string[];
  readonly quietFrom?: string | null;
  readonly quietTo?: string | null;
  readonly timezone?: string;
}
