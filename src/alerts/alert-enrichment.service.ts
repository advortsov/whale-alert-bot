import { Inject, Injectable } from '@nestjs/common';
import { formatUnits } from 'ethers';

import { EventDirection, type ClassifiedEvent } from '../chain/chain.types';
import { TOKEN_METADATA_ADAPTER } from '../core/ports/token-metadata/token-metadata-port.tokens';
import type { ITokenMetadataAdapter } from '../core/ports/token-metadata/token-metadata.interfaces';

const VALUE_DISPLAY_PRECISION = 6;

@Injectable()
export class AlertEnrichmentService {
  public constructor(
    @Inject(TOKEN_METADATA_ADAPTER)
    private readonly tokenMetadataService: ITokenMetadataAdapter,
  ) {}

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
      return asNumber.toFixed(VALUE_DISPLAY_PRECISION);
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
