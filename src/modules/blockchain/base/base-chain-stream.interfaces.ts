import type { AlertDispatcherService } from '../../../alerts/alert-dispatcher.service';
import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { ChainCheckpointsRepository } from '../../../database/repositories/chain-checkpoints.repository';
import type { ProcessedEventsRepository } from '../../../database/repositories/processed-events.repository';
import type { SubscriptionsRepository } from '../../../database/repositories/subscriptions.repository';
import type { WalletEventsRepository } from '../../../database/repositories/wallet-events.repository';
import type { ProviderFailoverService } from '../factory/provider-failover.service';

export interface IChainStreamConfig {
  readonly logPrefix: string;
  readonly chainKey: ChainKey;
  readonly chainId: number;
  readonly defaultHeartbeatIntervalSec: number;
}

export interface IMatchedTransaction {
  readonly txHash: string;
  readonly txFrom: string;
  readonly txTo: string | null;
  readonly trackedAddress: string;
  readonly blockTimestampSec: number | null;
}

export interface IChainRuntimeSnapshot {
  readonly chainKey: ChainKey;
  readonly observedBlock: number | null;
  readonly processedBlock: number | null;
  readonly lag: number | null;
  readonly queueSize: number;
  readonly backoffMs: number;
  readonly isDegradationMode: boolean;
  readonly updatedAtIso: string;
}

export interface IBaseChainStreamDependencies {
  readonly providerFailoverService: ProviderFailoverService;
  readonly chainCheckpointsRepository: ChainCheckpointsRepository;
  readonly subscriptionsRepository: SubscriptionsRepository;
  readonly processedEventsRepository: ProcessedEventsRepository;
  readonly walletEventsRepository: WalletEventsRepository;
  readonly alertDispatcherService: AlertDispatcherService;
}
