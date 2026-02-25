import { Injectable } from '@nestjs/common';

import {
  ERC20_TRANSFER_TOPIC,
  SUPPORTED_SWAP_TOPICS,
  UNISWAP_V2_SWAP_TOPIC,
  UNISWAP_V3_SWAP_TOPIC,
} from '../../../../common/constants/event-signatures';
import {
  AssetStandard,
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
  type ObservedTransaction,
} from '../../../../common/interfaces/chain.types';
import { AppConfigService } from '../../../../config/app-config.service';

const ETH_TOPIC_HEX_LENGTH = 66;
const ETH_ADDRESS_OFFSET = 26;
const RADIX_DECIMAL = 10;

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

      const swapEvent: ClassifiedEvent | null = this.classifySwapLog(
        event,
        log,
        topic0,
        normalizedTrackedAddress,
      );

      if (swapEvent !== null) {
        return swapEvent;
      }

      const transferEvent: ClassifiedEvent | null = this.classifyTransferLog(
        event,
        log,
        topic0,
        normalizedTrackedAddress,
      );

      if (transferEvent !== null) {
        return transferEvent;
      }
    }

    return this.buildUnknownEvent(event);
  }

  private topicToAddress(topic: string | undefined): string | null {
    if (topic?.length !== ETH_TOPIC_HEX_LENGTH) {
      return null;
    }

    return `0x${topic.slice(ETH_ADDRESS_OFFSET)}`.toLowerCase();
  }

  private tryDecodeUint256(hexData: string): string | null {
    if (!hexData.startsWith('0x')) {
      return null;
    }

    try {
      return BigInt(hexData).toString(RADIX_DECIMAL);
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

  private classifyTransferLog(
    event: ObservedTransaction,
    log: ObservedTransaction['logs'][number],
    topic0: string,
    normalizedTrackedAddress: string,
  ): ClassifiedEvent | null {
    if (topic0 !== ERC20_TRANSFER_TOPIC) {
      return null;
    }

    const fromAddress: string | null = this.topicToAddress(log.topics[1]);
    const toAddress: string | null = this.topicToAddress(log.topics[2]);
    const isTrackedTransfer: boolean =
      fromAddress === normalizedTrackedAddress || toAddress === normalizedTrackedAddress;

    if (!isTrackedTransfer) {
      return null;
    }

    const transferDirection: EventDirection =
      fromAddress === normalizedTrackedAddress ? EventDirection.OUT : EventDirection.IN;
    const counterpartyAddress: string | null =
      transferDirection === EventDirection.OUT ? toAddress : fromAddress;

    return this.buildTransferEvent(event, log, transferDirection, counterpartyAddress);
  }

  private classifySwapLog(
    event: ObservedTransaction,
    log: ObservedTransaction['logs'][number],
    topic0: string,
    normalizedTrackedAddress: string,
  ): ClassifiedEvent | null {
    const isSwapTopic: boolean = SUPPORTED_SWAP_TOPICS.includes(topic0);
    const isAllowedPool: boolean =
      this.swapAllowlist.size === 0 || this.swapAllowlist.has(log.address);

    if (!isSwapTopic || !isAllowedPool) {
      return null;
    }

    const swapDirection: EventDirection = this.resolveSwapDirection(
      event.txFrom.toLowerCase(),
      event.txTo?.toLowerCase() ?? null,
      normalizedTrackedAddress,
    );

    return this.buildSwapEvent(event, log, topic0, swapDirection);
  }

  private buildTransferEvent(
    event: ObservedTransaction,
    log: ObservedTransaction['logs'][number],
    direction: EventDirection,
    counterpartyAddress: string | null,
  ): ClassifiedEvent {
    return {
      chainId: ChainId.ETHEREUM_MAINNET,
      txHash: event.txHash,
      logIndex: log.logIndex,
      trackedAddress: event.trackedAddress,
      eventType: ClassifiedEventType.TRANSFER,
      direction,
      assetStandard: AssetStandard.ERC20,
      contractAddress: log.address,
      tokenAddress: log.address,
      tokenSymbol: null,
      tokenDecimals: null,
      tokenAmountRaw: this.tryDecodeUint256(log.data),
      valueFormatted: null,
      counterpartyAddress,
      dex: null,
      pair: null,
      usdPrice: null,
      usdAmount: null,
      usdUnavailable: true,
      swapFromSymbol: null,
      swapFromAmountText: null,
      swapToSymbol: null,
      swapToAmountText: null,
    };
  }

  private buildSwapEvent(
    event: ObservedTransaction,
    log: ObservedTransaction['logs'][number],
    topic0: string,
    direction: EventDirection,
  ): ClassifiedEvent {
    return {
      chainId: event.chainId,
      txHash: event.txHash,
      logIndex: log.logIndex,
      trackedAddress: event.trackedAddress,
      eventType: ClassifiedEventType.SWAP,
      direction,
      assetStandard: AssetStandard.NATIVE,
      contractAddress: log.address,
      tokenAddress: null,
      tokenSymbol: null,
      tokenDecimals: null,
      tokenAmountRaw: null,
      valueFormatted: null,
      counterpartyAddress: null,
      dex: this.mapDex(topic0),
      pair: null,
      usdPrice: null,
      usdAmount: null,
      usdUnavailable: true,
      swapFromSymbol: null,
      swapFromAmountText: null,
      swapToSymbol: null,
      swapToAmountText: null,
    };
  }

  private buildUnknownEvent(event: ObservedTransaction): ClassifiedEvent {
    return {
      chainId: event.chainId,
      txHash: event.txHash,
      logIndex: 0,
      trackedAddress: event.trackedAddress,
      eventType: ClassifiedEventType.UNKNOWN,
      direction: EventDirection.UNKNOWN,
      assetStandard: AssetStandard.NATIVE,
      contractAddress: null,
      tokenAddress: null,
      tokenSymbol: null,
      tokenDecimals: null,
      tokenAmountRaw: null,
      valueFormatted: null,
      counterpartyAddress: null,
      dex: null,
      pair: null,
      usdPrice: null,
      usdAmount: null,
      usdUnavailable: true,
      swapFromSymbol: null,
      swapFromAmountText: null,
      swapToSymbol: null,
      swapToAmountText: null,
    };
  }
}
