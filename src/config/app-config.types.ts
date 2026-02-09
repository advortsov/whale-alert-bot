export type NodeEnv = 'development' | 'test' | 'production';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type AppConfig = {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly telegramEnabled: boolean;
  readonly chainWatcherEnabled: boolean;
  readonly chainReceiptConcurrency: number;
  readonly chainRpcMinIntervalMs: number;
  readonly chainBackoffBaseMs: number;
  readonly chainBackoffMaxMs: number;
  readonly chainBlockQueueMax: number;
  readonly chainHeartbeatIntervalSec: number;
  readonly botToken: string | null;
  readonly databaseUrl: string;
  readonly ethAlchemyWssUrl: string | null;
  readonly ethInfuraWssUrl: string | null;
  readonly uniswapSwapAllowlist: readonly string[];
  readonly etherscanTxBaseUrl: string;
  readonly etherscanApiBaseUrl: string;
  readonly etherscanApiKey: string | null;
};
