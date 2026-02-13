import type { ChainId, ClassifiedEvent } from '../../../chain/chain.types';
import type { IReceiptEnvelope } from '../rpc/block-stream.interfaces';

export interface IClassificationContextDto {
  readonly chainId: ChainId;
  readonly txHash: string;
  readonly trackedAddress: string;
  readonly txFrom: string;
  readonly txTo: string | null;
  readonly receiptEnvelope: IReceiptEnvelope | null;
}

export interface IClassificationResultDto {
  readonly event: ClassifiedEvent;
}

export interface IChainEventClassifier {
  classify(context: IClassificationContextDto): IClassificationResultDto;
}
