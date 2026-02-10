import { Module } from '@nestjs/common';

import { AlertDispatcherService } from './alert-dispatcher.service';
import { AlertEnrichmentService } from './alert-enrichment.service';
import { AlertFilterPolicyService } from './alert-filter-policy.service';
import { AlertMessageFormatter } from './alert-message.formatter';
import { AlertSuppressionService } from './alert-suppression.service';
import { CexAddressBookService } from './cex-address-book.service';
import { QuietHoursService } from './quiet-hours.service';
import { TokenMetadataService } from './token-metadata.service';
import { TOKEN_METADATA_ADAPTER } from '../core/ports/token-metadata/token-metadata-port.tokens';
import { TOKEN_PRICING_PORT } from '../core/ports/token-pricing/token-pricing-port.tokens';
import { EthereumTokenMetadataAdapter } from '../integrations/token-metadata/ethereum/ethereum-token-metadata.adapter';
import { CoinGeckoPricingAdapter } from '../integrations/token-pricing/coingecko/coingecko-pricing.adapter';
import { StorageModule } from '../storage/storage.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [StorageModule, TelegramModule],
  providers: [
    EthereumTokenMetadataAdapter,
    CoinGeckoPricingAdapter,
    {
      provide: TOKEN_METADATA_ADAPTER,
      useExisting: EthereumTokenMetadataAdapter,
    },
    {
      provide: TOKEN_PRICING_PORT,
      useExisting: CoinGeckoPricingAdapter,
    },
    TokenMetadataService,
    AlertEnrichmentService,
    AlertSuppressionService,
    AlertFilterPolicyService,
    CexAddressBookService,
    QuietHoursService,
    AlertMessageFormatter,
    AlertDispatcherService,
  ],
  exports: [
    TokenMetadataService,
    AlertEnrichmentService,
    AlertSuppressionService,
    AlertFilterPolicyService,
    CexAddressBookService,
    QuietHoursService,
    AlertMessageFormatter,
    AlertDispatcherService,
  ],
})
export class AlertsModule {}
