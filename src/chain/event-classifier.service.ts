import { Injectable } from '@nestjs/common';

import {
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
  type ObservedTransaction,
} from './chain.types';
import { AppConfigService } from '../config/app-config.service';
import {
  ERC20_TRANSFER_TOPIC,
  SUPPORTED_SWAP_TOPICS,
  UNISWAP_V2_SWAP_TOPIC,
  UNISWAP_V3_SWAP_TOPIC,
} from './constants/event-signatures';

@Injectable()
export class EventClassifierService {
  private readonly swapAllowlist: ReadonlySet<string>;

  public constructor(private readonly appConfigService: AppConfigService) {
    this.swapAllowlist = new Set(
      this.appConfigService.uniswapSwapAllowlist.map((address: string): string =>
        address.toLowerCase(),
      ),
    );
  }

  public classify(event: ObservedTransaction): ClassifiedEvent {
    const normalizedTrackedAddress: string = event.trackedAddress.toLowerCase();

    for (const log of event.logs) {
      const topic0: string | undefined = log.topics[0]?.toLowerCase();

      if (!topic0) {
        continue;
      }

      if (topic0 === ERC20_TRANSFER_TOPIC) {
        const fromAddress: string | null = this.topicToAddress(log.topics[1]);
        const toAddress: string | null = this.topicToAddress(log.topics[2]);

        const isTrackedTransfer: boolean =
          fromAddress === normalizedTrackedAddress || toAddress === normalizedTrackedAddress;

        if (isTrackedTransfer) {
          const transferDirection: EventDirection =
            fromAddress === normalizedTrackedAddress ? EventDirection.OUT : EventDirection.IN;
          const counterpartyAddress: string | null =
            transferDirection === EventDirection.OUT ? toAddress : fromAddress;

          return {
            chainId: ChainId.ETHEREUM_MAINNET,
            txHash: event.txHash,
            logIndex: log.logIndex,
            trackedAddress: normalizedTrackedAddress,
            eventType: ClassifiedEventType.TRANSFER,
            direction: transferDirection,
            contractAddress: log.address,
            tokenAddress: log.address,
            tokenSymbol: null,
            tokenDecimals: null,
            tokenAmountRaw: this.tryDecodeUint256(log.data),
            valueFormatted: null,
            counterpartyAddress,
            dex: null,
            pair: null,
          };
        }
      }

      const isSwapTopic: boolean = SUPPORTED_SWAP_TOPICS.includes(topic0);
      const isAllowedPool: boolean =
        this.swapAllowlist.size === 0 || this.swapAllowlist.has(log.address);

      if (isSwapTopic && isAllowedPool) {
        const swapDirection: EventDirection = this.resolveSwapDirection(
          event.txFrom.toLowerCase(),
          event.txTo?.toLowerCase() ?? null,
          normalizedTrackedAddress,
        );

        return {
          chainId: event.chainId,
          txHash: event.txHash,
          logIndex: log.logIndex,
          trackedAddress: normalizedTrackedAddress,
          eventType: ClassifiedEventType.SWAP,
          direction: swapDirection,
          contractAddress: log.address,
          tokenAddress: null,
          tokenSymbol: null,
          tokenDecimals: null,
          tokenAmountRaw: null,
          valueFormatted: null,
          counterpartyAddress: null,
          dex: this.mapDex(topic0),
          pair: null,
        };
      }
    }

    return {
      chainId: event.chainId,
      txHash: event.txHash,
      logIndex: 0,
      trackedAddress: normalizedTrackedAddress,
      eventType: ClassifiedEventType.UNKNOWN,
      direction: EventDirection.UNKNOWN,
      contractAddress: null,
      tokenAddress: null,
      tokenSymbol: null,
      tokenDecimals: null,
      tokenAmountRaw: null,
      valueFormatted: null,
      counterpartyAddress: null,
      dex: null,
      pair: null,
    };
  }

  private topicToAddress(topic: string | undefined): string | null {
    if (topic?.length !== 66) {
      return null;
    }

    return `0x${topic.slice(26)}`.toLowerCase();
  }

  private tryDecodeUint256(hexData: string): string | null {
    if (!hexData.startsWith('0x')) {
      return null;
    }

    try {
      return BigInt(hexData).toString(10);
    } catch {
      return null;
    }
  }

  private mapDex(topic0: string): string {
    if (topic0 === UNISWAP_V2_SWAP_TOPIC) {
      return 'Uniswap V2';
    }

    if (topic0 === UNISWAP_V3_SWAP_TOPIC) {
      return 'Uniswap V3';
    }

    return 'Unknown DEX';
  }

  private resolveSwapDirection(
    txFrom: string,
    txTo: string | null,
    trackedAddress: string,
  ): EventDirection {
    if (txFrom === trackedAddress) {
      return EventDirection.OUT;
    }

    if (txTo === trackedAddress) {
      return EventDirection.IN;
    }

    return EventDirection.UNKNOWN;
  }
}
