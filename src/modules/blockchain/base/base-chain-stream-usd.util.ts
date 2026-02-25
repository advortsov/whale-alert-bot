import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { ClassifiedEvent } from '../../../common/interfaces/chain.types';
import type { ITokenHistoricalPricingPort } from '../../../common/interfaces/token-pricing/token-pricing.interfaces';

interface IEnrichClassifiedEventWithUsdArgs {
  readonly chainKey: ChainKey;
  readonly event: ClassifiedEvent;
  readonly occurredAt: Date;
  readonly tokenHistoricalPricingPort: ITokenHistoricalPricingPort;
}

const buildUnavailableUsdEvent = (event: ClassifiedEvent): ClassifiedEvent => ({
  ...event,
  usdPrice: null,
  usdAmount: null,
  usdUnavailable: true,
});

const resolveEventAmount = (event: ClassifiedEvent): number | null => {
  if (typeof event.valueFormatted !== 'string' || event.valueFormatted.trim().length === 0) {
    return null;
  }

  const parsedValue: number = Number.parseFloat(event.valueFormatted);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return Math.abs(parsedValue);
};

export const enrichClassifiedEventWithUsd = async (
  args: IEnrichClassifiedEventWithUsdArgs,
): Promise<ClassifiedEvent> => {
  const amount: number | null = resolveEventAmount(args.event);

  if (amount === null || amount <= 0) {
    return buildUnavailableUsdEvent(args.event);
  }

  const timestampSec: number = Math.floor(args.occurredAt.getTime() / 1000);
  const quote = await args.tokenHistoricalPricingPort.getUsdQuoteAt({
    chainKey: args.chainKey,
    tokenAddress: args.event.tokenAddress,
    tokenSymbol: args.event.tokenSymbol,
    timestampSec,
  });

  if (quote === null || !Number.isFinite(quote.usdPrice) || quote.usdPrice <= 0) {
    return buildUnavailableUsdEvent(args.event);
  }

  return {
    ...args.event,
    usdPrice: quote.usdPrice,
    usdAmount: amount * quote.usdPrice,
    usdUnavailable: false,
  };
};
