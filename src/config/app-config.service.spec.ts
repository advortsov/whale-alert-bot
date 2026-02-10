import { describe, expect, it } from 'vitest';

import { AppConfigService } from './app-config.service';

const withEnv = (env: NodeJS.ProcessEnv, action: () => void): void => {
  const previousEnv: NodeJS.ProcessEnv = { ...process.env };
  process.env = env;

  try {
    action();
  } finally {
    process.env = previousEnv;
  }
};

const createBaseEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'info',
  TELEGRAM_ENABLED: 'false',
  CHAIN_WATCHER_ENABLED: 'false',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/whale_alert_bot',
  ETHERSCAN_TX_BASE_URL: 'https://etherscan.io/tx/',
});

describe('AppConfigService', (): void => {
  it('throws when watcher is enabled without alchemy url', (): void => {
    withEnv(
      {
        ...createBaseEnv(),
        CHAIN_WATCHER_ENABLED: 'true',
        ETH_INFURA_WSS_URL: 'wss://mainnet.infura.io/ws/v3/test',
      },
      (): void => {
        expect((): AppConfigService => new AppConfigService()).toThrow(
          'ETH_ALCHEMY_WSS_URL is required when CHAIN_WATCHER_ENABLED=true',
        );
      },
    );
  });

  it('throws when watcher is enabled without infura url', (): void => {
    withEnv(
      {
        ...createBaseEnv(),
        CHAIN_WATCHER_ENABLED: 'true',
        ETH_ALCHEMY_WSS_URL: 'wss://eth-mainnet.g.alchemy.com/v2/test',
      },
      (): void => {
        expect((): AppConfigService => new AppConfigService()).toThrow(
          'ETH_INFURA_WSS_URL is required when CHAIN_WATCHER_ENABLED=true',
        );
      },
    );
  });

  it('throws when solana watcher is enabled without primary http url', (): void => {
    withEnv(
      {
        ...createBaseEnv(),
        SOLANA_WATCHER_ENABLED: 'true',
        SOLANA_HELIUS_WSS_URL: 'wss://api.mainnet-beta.solana.com',
        SOLANA_PUBLIC_HTTP_URL: 'https://solana-rpc.publicnode.com',
        SOLANA_PUBLIC_WSS_URL: 'wss://solana-rpc.publicnode.com',
      },
      (): void => {
        expect((): AppConfigService => new AppConfigService()).toThrow(
          'SOLANA_HELIUS_HTTP_URL is required when SOLANA_WATCHER_ENABLED=true',
        );
      },
    );
  });

  it('throws when solana watcher is enabled without fallback ws url', (): void => {
    withEnv(
      {
        ...createBaseEnv(),
        SOLANA_WATCHER_ENABLED: 'true',
        SOLANA_HELIUS_HTTP_URL: 'https://api.mainnet-beta.solana.com',
        SOLANA_HELIUS_WSS_URL: 'wss://api.mainnet-beta.solana.com',
        SOLANA_PUBLIC_HTTP_URL: 'https://solana-rpc.publicnode.com',
      },
      (): void => {
        expect((): AppConfigService => new AppConfigService()).toThrow(
          'SOLANA_PUBLIC_WSS_URL is required when SOLANA_WATCHER_ENABLED=true',
        );
      },
    );
  });

  it('throws when tron watcher is enabled without primary http url', (): void => {
    withEnv(
      {
        ...createBaseEnv(),
        TRON_WATCHER_ENABLED: 'true',
        TRON_FALLBACK_HTTP_URL: 'https://api.trongrid.io',
      },
      (): void => {
        expect((): AppConfigService => new AppConfigService()).toThrow(
          'TRON_PRIMARY_HTTP_URL is required when TRON_WATCHER_ENABLED=true',
        );
      },
    );
  });

  it('throws when tron watcher is enabled without fallback http url', (): void => {
    withEnv(
      {
        ...createBaseEnv(),
        TRON_WATCHER_ENABLED: 'true',
        TRON_PRIMARY_HTTP_URL: 'https://api.trongrid.io',
      },
      (): void => {
        expect((): AppConfigService => new AppConfigService()).toThrow(
          'TRON_FALLBACK_HTTP_URL is required when TRON_WATCHER_ENABLED=true',
        );
      },
    );
  });

  it('uses default values for alert throttling and token metadata cache config', (): void => {
    withEnv(createBaseEnv(), (): void => {
      const config: AppConfigService = new AppConfigService();

      expect(config.alertMinSendIntervalSec).toBe(10);
      expect(config.tokenMetaCacheTtlSec).toBe(3600);
      expect(config.chainReorgConfirmations).toBe(2);
    });
  });

  it('uses default chain backoff bounds for exponential throttling', (): void => {
    withEnv(createBaseEnv(), (): void => {
      const config: AppConfigService = new AppConfigService();

      expect(config.chainBackoffBaseMs).toBe(1000);
      expect(config.chainSolanaBackoffBaseMs).toBe(5000);
      expect(config.chainBackoffMaxMs).toBe(60000);
    });
  });

  it('throws when solana backoff base exceeds max', (): void => {
    withEnv(
      {
        ...createBaseEnv(),
        CHAIN_BACKOFF_MAX_MS: '4000',
        CHAIN_SOLANA_BACKOFF_BASE_MS: '5000',
      },
      (): void => {
        expect((): AppConfigService => new AppConfigService()).toThrow(
          'CHAIN_BACKOFF_MAX_MS must be >= CHAIN_SOLANA_BACKOFF_BASE_MS',
        );
      },
    );
  });

  it('resolves app version from env override', (): void => {
    withEnv(
      {
        ...createBaseEnv(),
        APP_VERSION: '1.2.3-test',
      },
      (): void => {
        const config: AppConfigService = new AppConfigService();

        expect(config.appVersion).toBe('1.2.3-test');
      },
    );
  });

  it('uses default TRON history endpoint configuration', (): void => {
    withEnv(createBaseEnv(), (): void => {
      const config: AppConfigService = new AppConfigService();

      expect(config.tronGridApiBaseUrl).toBe('https://api.trongrid.io');
      expect(config.tronGridApiKey).toBeNull();
      expect(config.tronscanTxBaseUrl).toBe('https://tronscan.org/#/transaction/');
      expect(config.tronWatcherEnabled).toBe(false);
      expect(config.tronPrimaryHttpUrl).toBeNull();
      expect(config.tronFallbackHttpUrl).toBeNull();
    });
  });

  it('treats empty TRON grid api key as null', (): void => {
    withEnv(
      {
        ...createBaseEnv(),
        TRON_GRID_API_KEY: '',
      },
      (): void => {
        const config: AppConfigService = new AppConfigService();

        expect(config.tronGridApiKey).toBeNull();
      },
    );
  });
});
