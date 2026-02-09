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

  it('uses default values for alert throttling and token metadata cache config', (): void => {
    withEnv(createBaseEnv(), (): void => {
      const config: AppConfigService = new AppConfigService();

      expect(config.alertMinSendIntervalSec).toBe(10);
      expect(config.tokenMetaCacheTtlSec).toBe(3600);
      expect(config.chainReorgConfirmations).toBe(2);
    });
  });
});
