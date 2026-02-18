import { Injectable } from '@nestjs/common';

import { ERC20_TRANSFER_TOPIC } from '../../chain/constants/event-signatures';
import {
  AssetStandard,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
} from '../../common/interfaces/chain.types';
import type {
  IClassificationContextDto,
  IClassificationResultDto,
  IChainEventClassifier,
} from '../../core/ports/classification/chain-classifier.interfaces';
import { TronAddressCodec } from '../../integrations/address/tron/tron-address.codec';

const TRON_ADDRESS_HEX_MIN_LENGTH = 40;
const TRON_ADDRESS_HEX_TAIL = -40;
const RADIX_DECIMAL = 10;

@Injectable()
export class TronEventClassifierService implements IChainEventClassifier {
  private static readonly TRC10_HINT_TOPIC: string = 'tron:trc10';
  private static readonly NATIVE_HINT_TOPIC: string = 'tron:native';

  public constructor(private readonly tronAddressCodec: TronAddressCodec) {}

  public classify(context: IClassificationContextDto): IClassificationResultDto {
    const trc20Event: ClassifiedEvent | null = this.tryClassifyTrc20(context);

    if (trc20Event !== null) {
      return { event: trc20Event };
    }

    const trc10Event: ClassifiedEvent | null = this.tryClassifyTrc10(context);

    if (trc10Event !== null) {
      return { event: trc10Event };
    }

    const nativeEvent: ClassifiedEvent = this.classifyNativeTransfer(context);
    return { event: nativeEvent };
  }

  private tryClassifyTrc20(context: IClassificationContextDto): ClassifiedEvent | null {
    if (context.receiptEnvelope === null) {
      return null;
    }

    for (const log of context.receiptEnvelope.logs) {
      const topic0: string | undefined = log.topics[0];

      if (topic0 !== ERC20_TRANSFER_TOPIC) {
        continue;
      }

      const fromAddress: string | null = this.decodeTopicAddress(log.topics[1]);
      const toAddress: string | null = this.decodeTopicAddress(log.topics[2]);

      if (fromAddress === null || toAddress === null) {
        continue;
      }

      const direction: EventDirection = this.resolveDirectionByTopic(
        context.trackedAddress,
        fromAddress,
        toAddress,
      );

      if (direction === EventDirection.UNKNOWN) {
        continue;
      }

      const counterpartyAddress: string | null =
        direction === EventDirection.OUT ? toAddress : fromAddress;
      const tokenAmountRaw: string | null = this.decodeUint256(log.data);
      const tokenAddress: string | null = log.address === 'tron-log' ? null : log.address;

      return {
        chainId: context.chainId,
        txHash: context.txHash,
        logIndex: log.logIndex,
        trackedAddress: context.trackedAddress,
        eventType: ClassifiedEventType.TRANSFER,
        direction,
        assetStandard: AssetStandard.TRC20,
        contractAddress: tokenAddress,
        tokenAddress,
        tokenSymbol: 'TRC20',
        tokenDecimals: null,
        tokenAmountRaw,
        valueFormatted: null,
        counterpartyAddress,
        dex: null,
        pair: null,
      };
    }

    return null;
  }

  private tryClassifyTrc10(context: IClassificationContextDto): ClassifiedEvent | null {
    if (context.receiptEnvelope === null) {
      return null;
    }

    const trc10Log = context.receiptEnvelope.logs.find((log): boolean => {
      const topic0: string | undefined = log.topics[0];
      return topic0 === TronEventClassifierService.TRC10_HINT_TOPIC;
    });

    if (typeof trc10Log === 'undefined') {
      return null;
    }

    const direction: EventDirection = this.resolveDirectionByEnvelope(context);
    const tokenAmountRaw: string | null = this.decodeUint256(trc10Log.data);
    const tokenSymbol: string =
      typeof trc10Log.topics[1] === 'string' && trc10Log.topics[1].trim().length > 0
        ? trc10Log.topics[1]
        : 'TRC10';
    const counterpartyAddress: string | null =
      direction === EventDirection.OUT ? context.txTo : context.txFrom;
    const eventType: ClassifiedEventType =
      direction === EventDirection.UNKNOWN
        ? ClassifiedEventType.UNKNOWN
        : ClassifiedEventType.TRANSFER;

    return {
      chainId: context.chainId,
      txHash: context.txHash,
      logIndex: trc10Log.logIndex,
      trackedAddress: context.trackedAddress,
      eventType,
      direction,
      assetStandard: AssetStandard.TRC10,
      contractAddress: null,
      tokenAddress: null,
      tokenSymbol,
      tokenDecimals: null,
      tokenAmountRaw,
      valueFormatted: null,
      counterpartyAddress,
      dex: null,
      pair: null,
    };
  }

  private classifyNativeTransfer(context: IClassificationContextDto): ClassifiedEvent {
    const nativeLog = context.receiptEnvelope?.logs.find((log): boolean => {
      const topic0: string | undefined = log.topics[0];
      return topic0 === TronEventClassifierService.NATIVE_HINT_TOPIC;
    });
    const direction: EventDirection = this.resolveDirectionByEnvelope(context);
    const tokenAmountRaw: string | null =
      typeof nativeLog !== 'undefined' ? this.decodeUint256(nativeLog.data) : null;
    const counterpartyAddress: string | null =
      direction === EventDirection.OUT ? context.txTo : context.txFrom;
    const eventType: ClassifiedEventType =
      direction === EventDirection.UNKNOWN
        ? ClassifiedEventType.UNKNOWN
        : ClassifiedEventType.TRANSFER;

    return {
      chainId: context.chainId,
      txHash: context.txHash,
      logIndex: typeof nativeLog !== 'undefined' ? nativeLog.logIndex : 0,
      trackedAddress: context.trackedAddress,
      eventType,
      direction,
      assetStandard: AssetStandard.NATIVE,
      contractAddress: null,
      tokenAddress: null,
      tokenSymbol: 'TRX',
      tokenDecimals: 6,
      tokenAmountRaw,
      valueFormatted: null,
      counterpartyAddress,
      dex: null,
      pair: null,
    };
  }

  private resolveDirectionByEnvelope(context: IClassificationContextDto): EventDirection {
    if (context.txTo !== null && context.txTo === context.trackedAddress) {
      return EventDirection.IN;
    }

    if (context.txFrom === context.trackedAddress) {
      return EventDirection.OUT;
    }

    return EventDirection.UNKNOWN;
  }

  private resolveDirectionByTopic(
    trackedAddress: string,
    fromAddress: string,
    toAddress: string,
  ): EventDirection {
    if (trackedAddress === fromAddress) {
      return EventDirection.OUT;
    }

    if (trackedAddress === toAddress) {
      return EventDirection.IN;
    }

    return EventDirection.UNKNOWN;
  }

  private decodeTopicAddress(topicValue: string | undefined): string | null {
    if (typeof topicValue !== 'string') {
      return null;
    }

    const normalizedTopic: string = topicValue.trim().toLowerCase().replace(/^0x/, '');

    if (normalizedTopic.length < TRON_ADDRESS_HEX_MIN_LENGTH) {
      return null;
    }

    const tail40: string = normalizedTopic.slice(TRON_ADDRESS_HEX_TAIL);
    const tronHexAddress: string = `41${tail40}`;
    return this.tronAddressCodec.normalize(tronHexAddress);
  }

  private decodeUint256(hexValue: string | undefined): string | null {
    if (typeof hexValue !== 'string') {
      return null;
    }

    const normalizedHex: string = hexValue.trim().replace(/^0x/, '');

    if (normalizedHex.length === 0) {
      return null;
    }

    try {
      return BigInt(`0x${normalizedHex}`).toString(RADIX_DECIMAL);
    } catch {
      return null;
    }
  }
}
