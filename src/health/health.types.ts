import type { ChainRuntimeEntry } from '../runtime/runtime-status.interfaces';

export type ComponentHealth = {
  readonly ok: boolean;
  readonly details: string;
};

export type ChainStreamHealth = {
  readonly rpcPrimary: ComponentHealth;
  readonly rpcFallback: ComponentHealth;
  readonly runtime: ChainRuntimeEntry | null;
};

export type AppHealthStatus = {
  readonly status: 'ok' | 'degraded';
  readonly database: ComponentHealth;
  readonly ethereum: ChainStreamHealth;
  readonly solana: ChainStreamHealth;
  readonly tron: ChainStreamHealth;
  readonly telegram: ComponentHealth;
};
