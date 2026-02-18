import { Injectable } from '@nestjs/common';

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

const SOL_NATIVE_DECIMALS = 9;

@Injectable()
export class SolanaEventClassifierService implements IChainEventClassifier {
  private static readonly SPL_TOKEN_PROGRAM: string = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  private static readonly SPL_TRANSFER_HINTS: readonly string[] = [
    'tokenkeg',
    'spl-token',
    'instruction: transfer',
    'instruction: transferchecked',
  ];

  public classify(context: IClassificationContextDto): IClassificationResultDto {
    const direction: EventDirection = this.resolveDirection(
      context.txFrom,
      context.txTo,
      context.trackedAddress,
    );
    const isSplTransfer: boolean = this.isSplTransfer(context.receiptEnvelope);
    const counterpartyAddress: string | null =
      direction === EventDirection.IN
        ? context.txFrom
        : direction === EventDirection.OUT
          ? context.txTo
          : null;
    const tokenAmountRaw: string | null = this.extractAmountRaw(context.receiptEnvelope);
    const eventType: ClassifiedEventType =
      direction === EventDirection.UNKNOWN
        ? ClassifiedEventType.UNKNOWN
        : ClassifiedEventType.TRANSFER;
    const event: ClassifiedEvent = {
      chainId: context.chainId,
      txHash: context.txHash,
      logIndex: 0,
      trackedAddress: context.trackedAddress,
      eventType,
      direction,
      assetStandard: isSplTransfer ? AssetStandard.SPL : AssetStandard.NATIVE,
      contractAddress: isSplTransfer ? SolanaEventClassifierService.SPL_TOKEN_PROGRAM : null,
      tokenAddress: null,
      tokenSymbol: isSplTransfer ? 'SPL' : 'SOL',
      tokenDecimals: isSplTransfer ? null : SOL_NATIVE_DECIMALS,
      tokenAmountRaw,
      valueFormatted: null,
      counterpartyAddress,
      dex: null,
      pair: null,
    };

    return { event };
  }

  private resolveDirection(
    txFrom: string,
    txTo: string | null,
    trackedAddress: string,
  ): EventDirection {
    if (txTo !== null && txTo === trackedAddress) {
      return EventDirection.IN;
    }

    if (txFrom === trackedAddress) {
      return EventDirection.OUT;
    }

    return EventDirection.UNKNOWN;
  }

  private isSplTransfer(receiptEnvelope: IClassificationContextDto['receiptEnvelope']): boolean {
    if (receiptEnvelope === null) {
      return false;
    }

    return receiptEnvelope.logs.some((log): boolean => {
      const normalizedLog: string = log.data.toLowerCase();
      return SolanaEventClassifierService.SPL_TRANSFER_HINTS.some((hint: string): boolean =>
        normalizedLog.includes(hint),
      );
    });
  }

  private extractAmountRaw(
    receiptEnvelope: IClassificationContextDto['receiptEnvelope'],
  ): string | null {
    if (receiptEnvelope === null) {
      return null;
    }

    for (const log of receiptEnvelope.logs) {
      const match: RegExpExecArray | null = /(?:amount|lamports|tokens?)\D+(\d{1,30})/i.exec(
        log.data,
      );

      if (match !== null && typeof match[1] === 'string') {
        return match[1];
      }
    }

    return null;
  }
}
