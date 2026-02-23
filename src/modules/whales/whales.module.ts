import { Module, forwardRef } from '@nestjs/common';

import {
  AlertDispatcherDependencies,
  AlertDispatcherService,
} from './services/alert-dispatcher.service';
import { AlertEnrichmentService } from './services/alert-enrichment.service';
import { AlertFilterPolicyService } from './services/alert-filter-policy.service';
import { AlertMessageFormatter } from './services/alert-message.formatter';
import {
  AlertRecipientEvaluatorDependencies,
  AlertRecipientEvaluatorService,
} from './services/alert-recipient-evaluator.service';
import { AlertSuppressionService } from './services/alert-suppression.service';
import { CexAddressBookService } from './services/cex-address-book.service';
import { HistoryCacheService } from './services/history-cache.service';
import { HistoryExplorerRouterAdapter } from './services/history-explorer-router.adapter';
import { HistoryRateLimiterService } from './services/history-rate-limiter.service';
import { QuietHoursService } from './services/quiet-hours.service';
import { TokenMetadataService } from './services/token-metadata.service';
import { TrackingAddressService } from './services/tracking-address.service';
import { TrackingHistoryFormatterService } from './services/tracking-history-formatter.service';
import { TrackingHistoryPageService } from './services/tracking-history-page.service';
import { TrackingHistoryQueryParserService } from './services/tracking-history-query-parser.service';
import {
  TrackingHistoryService,
  TrackingHistoryServiceDependencies,
} from './services/tracking-history.service';
import { TrackingSettingsParserService } from './services/tracking-settings-parser.service';
import {
  TrackingSettingsService,
  TrackingSettingsServiceDependencies,
} from './services/tracking-settings.service';
import { TrackingWalletsServiceDependencies } from './services/tracking-wallets.dependencies';
import { TrackingWalletsService } from './services/tracking-wallets.service';
import { TrackingService } from './services/tracking.service';
import { ADDRESS_CODEC_REGISTRY } from '../../common/interfaces/address/address-port.tokens';
import { ALERT_DISPATCHER } from '../../common/interfaces/alerts/alert-dispatcher-port.tokens';
import { HISTORY_EXPLORER_ADAPTER } from '../../common/interfaces/explorers/explorer-port.tokens';
import { TOKEN_METADATA_ADAPTER } from '../../common/interfaces/token-metadata/token-metadata-port.tokens';
import { TOKEN_PRICING_PORT } from '../../common/interfaces/token-pricing/token-pricing-port.tokens';
import { DatabaseModule } from '../../database/database.module';
import { RateLimitingModule } from '../blockchain/rate-limiting/rate-limiting.module';
import { AddressCodecRegistry } from '../chains/address-codec.registry';
import { ChainsModule } from '../chains/chains.module';
import { EthereumTokenMetadataAdapter } from '../chains/ethereum/ethereum-token-metadata.adapter';
import { SolanaRpcHistoryAdapter } from '../chains/solana/solana-rpc-history.adapter';
import { CoinGeckoPricingAdapter } from '../integrations/coingecko/coingecko-pricing.adapter';
import { EtherscanHistoryAdapter } from '../integrations/etherscan/etherscan-history.adapter';
import { TronGridHistoryAdapter } from '../integrations/trongrid/tron-grid-history.adapter';

@Module({
  imports: [DatabaseModule, RateLimitingModule, forwardRef(() => ChainsModule)],
  providers: [
    // --- Address codecs + registry ---
    AddressCodecRegistry,
    { provide: ADDRESS_CODEC_REGISTRY, useExisting: AddressCodecRegistry },
    { provide: ALERT_DISPATCHER, useExisting: AlertDispatcherService },
    // --- History adapters + router ---
    EtherscanHistoryAdapter,
    SolanaRpcHistoryAdapter,
    TronGridHistoryAdapter,
    HistoryExplorerRouterAdapter,
    { provide: HISTORY_EXPLORER_ADAPTER, useExisting: HistoryExplorerRouterAdapter },
    // --- Token adapters ---
    EthereumTokenMetadataAdapter,
    CoinGeckoPricingAdapter,
    { provide: TOKEN_METADATA_ADAPTER, useExisting: EthereumTokenMetadataAdapter },
    { provide: TOKEN_PRICING_PORT, useExisting: CoinGeckoPricingAdapter },
    // --- Alerts services ---
    TokenMetadataService,
    AlertEnrichmentService,
    AlertSuppressionService,
    AlertFilterPolicyService,
    CexAddressBookService,
    QuietHoursService,
    AlertMessageFormatter,
    AlertRecipientEvaluatorDependencies,
    AlertRecipientEvaluatorService,
    AlertDispatcherDependencies,
    AlertDispatcherService,
    // --- Tracking services ---
    HistoryCacheService,
    HistoryRateLimiterService,
    TrackingAddressService,
    TrackingHistoryFormatterService,
    TrackingHistoryPageService,
    TrackingHistoryQueryParserService,
    TrackingSettingsParserService,
    TrackingWalletsServiceDependencies,
    TrackingWalletsService,
    TrackingSettingsServiceDependencies,
    TrackingSettingsService,
    TrackingHistoryServiceDependencies,
    TrackingHistoryService,
    TrackingService,
  ],
  exports: [
    TrackingService,
    TokenMetadataService,
    AlertEnrichmentService,
    AlertSuppressionService,
    AlertFilterPolicyService,
    CexAddressBookService,
    QuietHoursService,
    AlertMessageFormatter,
    AlertRecipientEvaluatorService,
    AlertDispatcherService,
    ALERT_DISPATCHER,
  ],
})
export class WhalesModule {}
