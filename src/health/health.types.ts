export type ComponentHealth = {
  readonly ok: boolean;
  readonly details: string;
};

export type AppHealthStatus = {
  readonly status: 'ok' | 'degraded';
  readonly database: ComponentHealth;
  readonly rpcPrimary: ComponentHealth;
  readonly rpcFallback: ComponentHealth;
  readonly telegram: ComponentHealth;
};
