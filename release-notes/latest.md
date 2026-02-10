# Последний релиз

- Добавлен live watcher для TRON (`TRON_WATCHER_ENABLED`) на базе domain-based RPC adapters: primary/fallback, polling `getnowblock/getblockbynum`.
- Реализован `TronChainStreamService`: pipeline `block -> match -> dedupe -> store -> alert` с сохранением событий в `wallet_events` и `processed_events`.
- `/health` теперь показывает отдельный статус `tronRpcPrimary/tronRpcFallback`.
- Исправлено сопоставление адресов в Ethereum/Solana watcher: сохраняется канонический `trackedAddress`, алерты корректно доставляются для mixed-case адресов.
- Улучшены action-кнопки в live-alert: explorer/portfolio/chart теперь chain-aware для ETH/SOL/TRON.
- Добавлены тесты: TRON RPC adapter, TRON chain stream, failover routing на TRON, расширены config tests под TRON watcher.
