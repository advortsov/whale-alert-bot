import { Module } from '@nestjs/common';

import { AlertDispatcherService } from './alert-dispatcher.service';
import { AlertEnrichmentService } from './alert-enrichment.service';
import { AlertMessageFormatter } from './alert-message.formatter';
import { AlertSuppressionService } from './alert-suppression.service';
import { TokenMetadataService } from './token-metadata.service';
import { TOKEN_METADATA_ADAPTER } from '../core/ports/token-metadata/token-metadata-port.tokens';
import { EthereumTokenMetadataAdapter } from '../integrations/token-metadata/ethereum/ethereum-token-metadata.adapter';
import { StorageModule } from '../storage/storage.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [StorageModule, TelegramModule],
  providers: [
    EthereumTokenMetadataAdapter,
    {
      provide: TOKEN_METADATA_ADAPTER,
      useExisting: EthereumTokenMetadataAdapter,
    },
    TokenMetadataService,
    AlertEnrichmentService,
    AlertSuppressionService,
    AlertMessageFormatter,
    AlertDispatcherService,
  ],
  exports: [
    TokenMetadataService,
    AlertEnrichmentService,
    AlertSuppressionService,
    AlertMessageFormatter,
    AlertDispatcherService,
  ],
})
export class AlertsModule {}
