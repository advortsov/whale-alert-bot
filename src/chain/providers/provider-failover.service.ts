import { Injectable, Logger } from '@nestjs/common';

import { ChainId } from '../chain.types';
import { ProviderFactory } from './provider.factory';
import type {
  IFallbackRpcProvider,
  IPrimaryRpcProvider,
  IProviderFailoverService,
  ProviderOperation,
} from '../interfaces/rpc-provider.interface';

@Injectable()
export class ProviderFailoverService implements IProviderFailoverService {
  private readonly logger: Logger = new Logger(ProviderFailoverService.name);

  public constructor(private readonly providerFactory: ProviderFactory) {}

  public async execute<T>(operation: ProviderOperation<T>): Promise<T> {
    const primaryProvider: IPrimaryRpcProvider = this.providerFactory.createPrimary(
      ChainId.ETHEREUM_MAINNET,
    );

    try {
      return await operation(primaryProvider);
    } catch (primaryError: unknown) {
      const primaryErrorMessage: string =
        primaryError instanceof Error ? primaryError.message : String(primaryError);
      this.logger.warn(`Primary provider failed: ${primaryErrorMessage}. Switching to fallback.`);

      const fallbackProvider: IFallbackRpcProvider = this.providerFactory.createFallback(
        ChainId.ETHEREUM_MAINNET,
      );

      return operation(fallbackProvider);
    }
  }
}
