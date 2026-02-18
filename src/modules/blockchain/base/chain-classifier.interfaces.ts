import type { IReceiptEnvelope } from './block-stream.interfaces';
import type { ChainId, ClassifiedEvent } from '../../../common/interfaces/chain.types';

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
