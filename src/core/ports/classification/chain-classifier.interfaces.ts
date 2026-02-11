import type { ChainId, ClassifiedEvent } from '../../../chain/chain.types';
import type { ReceiptEnvelope } from '../rpc/block-stream.interfaces';

export interface ClassificationContextDto {
  readonly chainId: ChainId;
  readonly txHash: string;
  readonly trackedAddress: string;
  readonly txFrom: string;
  readonly txTo: string | null;
  readonly receiptEnvelope: ReceiptEnvelope | null;
}

export interface ClassificationResultDto {
  readonly event: ClassifiedEvent;
}

export interface IChainEventClassifier {
  classify(context: ClassificationContextDto): ClassificationResultDto;
}
