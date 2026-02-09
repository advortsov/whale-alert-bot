import { Injectable } from '@nestjs/common';
import { formatUnits } from 'ethers';

import { TokenMetadataService } from './token-metadata.service';
import { EventDirection, type ClassifiedEvent } from '../chain/chain.types';

@Injectable()
export class AlertEnrichmentService {
  public constructor(private readonly tokenMetadataService: TokenMetadataService) {}

  public enrich(event: ClassifiedEvent): ClassifiedEvent {
    const tokenMetadata = this.tokenMetadataService.getMetadata(event.contractAddress);
    const tokenDecimals: number = tokenMetadata.decimals;
    const tokenSymbol: string = tokenMetadata.symbol;

    return {
      ...event,
      tokenAddress: event.contractAddress,
      tokenSymbol,
      tokenDecimals,
      valueFormatted: this.formatValue(event.tokenAmountRaw, tokenDecimals),
      direction: this.resolveDirection(event),
    };
  }

  private formatValue(valueRaw: string | null, decimals: number): string | null {
    if (!valueRaw) {
      return null;
    }

    try {
      const normalizedValue: string = formatUnits(BigInt(valueRaw), decimals);
      const asNumber: number = Number.parseFloat(normalizedValue);
      return asNumber.toFixed(6);
    } catch {
      return null;
    }
  }

  private resolveDirection(event: ClassifiedEvent): EventDirection {
    if (event.direction !== EventDirection.UNKNOWN) {
      return event.direction;
    }

    return EventDirection.UNKNOWN;
  }
}
