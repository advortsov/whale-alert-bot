# Последний релиз

- Добавлены chain-префиксы в stream-логах: `[ETH]`, `[SOL]`, `[TRON]`.
- Для Solana/TRON добавлены heartbeat-логи в `info` (observed/processed/lag/queue/backoff).
- Для Solana уменьшен шум и давление на free RPC: ограничен catch-up по слотам за один poll.
- Обработан кейс `skipped slot` (`-32007`) как нормальный `null`-block вместо исключения.
- Добавлен тест на `skipped slot` поведение в Solana RPC adapter.
- Для RPC failover введен per-chain/per-provider throttling (`primary:<chain>`, `fallback:<chain>`).
- При `429` на Solana primary включается cooldown и временный прямой routing в fallback.
- Для Solana добавлен отдельный стартовый backoff `5s` (`CHAIN_SOLANA_BACKOFF_BASE_MS=5000`).
- Для ETH/TRON сброс primary-backoff выполняется после серии успешных primary-вызовов.
- Для Solana авто-сброс primary-backoff отключен, чтобы не провоцировать повторные волны `429`.
- Дефолтный потолок экспоненциального backoff увеличен до `60s` (`CHAIN_BACKOFF_MAX_MS=60000`).
- Для TRON history добавлен fallback-ретрай при `HTTP 400` с мягкими query-параметрами.
