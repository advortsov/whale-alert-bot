import { type IBottleneckConfig, LimiterKey } from './bottleneck-rate-limiter.interfaces';
import type { AppConfigService } from '../../../config/app-config.service';

export function buildLimiterConfigs(
  config: AppConfigService,
): ReadonlyMap<LimiterKey, IBottleneckConfig> {
  const map = new Map<LimiterKey, IBottleneckConfig>();

  map.set(LimiterKey.ETHEREUM_PRIMARY, {
    minTime: config.rateLimitEthRpcMinTimeMs,
    maxConcurrent: config.rateLimitEthRpcMaxConcurrent,
  });

  map.set(LimiterKey.ETHEREUM_FALLBACK, {
    minTime: config.rateLimitEthRpcMinTimeMs,
    maxConcurrent: config.rateLimitEthRpcMaxConcurrent,
  });

  map.set(LimiterKey.SOLANA_HELIUS, {
    minTime: config.rateLimitSolanaHeliusMinTimeMs,
    maxConcurrent: config.rateLimitSolanaHeliusMaxConcurrent,
  });

  map.set(LimiterKey.SOLANA_PUBLIC, {
    minTime: config.rateLimitSolanaPublicMinTimeMs,
    maxConcurrent: config.rateLimitSolanaPublicMaxConcurrent,
  });

  map.set(LimiterKey.TRON_GRID, {
    minTime: config.rateLimitTronGridMinTimeMs,
    maxConcurrent: config.rateLimitTronGridMaxConcurrent,
  });

  map.set(LimiterKey.TRON_PUBLIC, {
    minTime: config.rateLimitTronPublicMinTimeMs,
    maxConcurrent: config.rateLimitTronPublicMaxConcurrent,
  });

  map.set(LimiterKey.ETHERSCAN, {
    minTime: config.rateLimitEtherscanMinTimeMs,
    maxConcurrent: config.rateLimitEtherscanMaxConcurrent,
  });

  map.set(LimiterKey.COINGECKO, {
    minTime: config.rateLimitCoingeckoMinTimeMs,
    maxConcurrent: config.rateLimitCoingeckoMaxConcurrent,
  });

  return map;
}
