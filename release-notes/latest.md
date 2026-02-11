## v0.1.4

- Извлечён абстрактный `BaseChainStreamService` — общая логика stream orchestration (checkpoint recovery, block queue, heartbeat, degradation, backpressure) вынесена из ETH/SOL/TRON сервисов, устранено дублирование.
- Добавлен порт `IChainEventClassifier` и chain-specific реализации: `SolanaEventClassifierService` (SPL/SOL), `TronEventClassifierService` (TRC20/TRC10/TRX native).
- Добавлен `AssetStandard` enum (NATIVE, ERC20, SPL, TRC20, TRC10) и миграция БД с полем `asset_standard` в `wallet_events` (backfill по chain+token).
- TRON RPC adapter строит синтетические hint-логи для TRC10/native transfers, позволяя классификатору унифицированно обрабатывать все типы активов.
- `RuntimeStatusService` собирает per-chain snapshots (lag, queue, backoff, degradation) и SLO-пороги с rate-limited warnings.
- Health endpoint переструктурирован на вложенную `ChainStreamHealth` (rpcPrimary, rpcFallback, runtime).

## v0.1.3

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
- Добавлены per-chain stream limits: `CHAIN_SOLANA_QUEUE_MAX`, `CHAIN_TRON_QUEUE_MAX`, `CHAIN_SOLANA_CATCHUP_BATCH`, `CHAIN_TRON_CATCHUP_BATCH`.
- Добавлены per-chain poll intervals: `CHAIN_SOLANA_POLL_INTERVAL_MS`, `CHAIN_TRON_POLL_INTERVAL_MS`.
- В Solana/TRON watcher добавлены bounded catchup и controlled degradation mode (`degradation_mode_enter/exit`) при переполнении очереди.
- Heartbeat расширен метриками `queueUsedPct`, `catchupDebt`, `degradationMode`.
