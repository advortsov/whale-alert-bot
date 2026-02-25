export enum LimiterKey {
  ETHEREUM_PRIMARY = 'ethereum_primary',
  ETHEREUM_FALLBACK = 'ethereum_fallback',
  SOLANA_HELIUS = 'solana_helius',
  SOLANA_PUBLIC = 'solana_public',
  TRON_GRID = 'tron_grid',
  TRON_PUBLIC = 'tron_public',
  ETHERSCAN = 'etherscan',
  COINGECKO = 'coingecko',
  COINGECKO_HISTORY = 'coingecko_history',
}

// Bottleneck priority: lower number = higher priority (0–9 range)
/* eslint-disable no-magic-numbers */
export enum RequestPriority {
  CRITICAL = 1,
  HIGH = 5,
  NORMAL = 7,
  LOW = 9,
}
/* eslint-enable no-magic-numbers */

export interface IBottleneckConfig {
  readonly minTime: number;
  readonly maxConcurrent: number;
  readonly reservoir?: number;
}

export interface ILimiterMetrics {
  readonly queueSize: number;
  readonly running: number;
}
