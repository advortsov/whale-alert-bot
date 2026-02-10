export type ComponentHealth = {
  readonly ok: boolean;
  readonly details: string;
};

export type AppHealthStatus = {
  readonly status: 'ok' | 'degraded';
  readonly database: ComponentHealth;
  readonly ethereumRpcPrimary: ComponentHealth;
  readonly ethereumRpcFallback: ComponentHealth;
  readonly solanaRpcPrimary: ComponentHealth;
  readonly solanaRpcFallback: ComponentHealth;
  readonly tronRpcPrimary: ComponentHealth;
  readonly tronRpcFallback: ComponentHealth;
  readonly telegram: ComponentHealth;
};
