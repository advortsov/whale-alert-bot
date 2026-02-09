# Whale Alert Bot

Telegram-бот на `NestJS + TypeScript` для отслеживания активности китов в Ethereum.

## Стек

- Node.js 22
- NestJS 11
- Telegram: `telegraf` + `nestjs-telegraf`
- Postgres + Kysely
- SQL миграции: Postgrator (`checksum` включен)
- Тесты: `vitest`

## Команды бота

- `/track <address> [label]`
- `/list`
- `/untrack <address|id>`
- `/history <address> [limit]`
- `/help`

## Быстрый старт

```bash
cp .env.example .env
npm ci
npm run db:validate
npm run db:migrate
npm run start:dev
```

## Креды БД (локально через Docker Compose)

- host: `localhost`
- port: `5432`
- database: `whale_alert_bot`
- username: `postgres`
- password: `postgres`
- connection string: `postgres://postgres:postgres@localhost:5432/whale_alert_bot`

## Скрипты качества

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run check` (полный gate)

Перед любым деплоем обязательно выполняется минимум `npm run lint`.

## Postgrator и checksum

- Миграции лежат в `database/migrations`.
- Разрешены только SQL-файлы формата: `NNN.do.name.sql` и `NNN.undo.name.sql`.
- Проверка checksum включена через `validateChecksums: true`.
- Таблица версий: `schemaversion`.

Команды:

```bash
npm run db:info
npm run db:validate
npm run db:migrate
```

## Архитектура RPC провайдеров

- `IPrimaryRpcProvider` и `IFallbackRpcProvider` как отдельные интерфейсы.
- `ProviderFactory` создает primary/fallback без строковых ролей.
- `ProviderFailoverService` выполняет fallback при ошибке primary.
- `RpcThrottlerService` ограничивает темп RPC и включает backoff при rate-limit/timeout.
- v1 провайдеры: Alchemy (primary), Infura (fallback).

## Параметры watcher (безопасные defaults для free API)

```env
CHAIN_WATCHER_ENABLED=false
CHAIN_RECEIPT_CONCURRENCY=2
CHAIN_RPC_MIN_INTERVAL_MS=350
CHAIN_BACKOFF_BASE_MS=1000
CHAIN_BACKOFF_MAX_MS=30000
CHAIN_BLOCK_QUEUE_MAX=120
CHAIN_HEARTBEAT_INTERVAL_SEC=60
ETHERSCAN_API_BASE_URL=https://api.etherscan.io/v2/api
ETHERSCAN_API_KEY=your_free_key
HISTORY_CACHE_TTL_SEC=120
HISTORY_RATE_LIMIT_PER_MINUTE=12
HISTORY_BUTTON_COOLDOWN_SEC=3
HISTORY_STALE_ON_ERROR_SEC=600
ALERT_MIN_SEND_INTERVAL_SEC=10
TOKEN_META_CACHE_TTL_SEC=3600
```

Fail-fast правило: если `CHAIN_WATCHER_ENABLED=true`, то `ETH_ALCHEMY_WSS_URL` и `ETH_INFURA_WSS_URL` обязательны.

## Workflow внешних API

Перед интеграцией любого внешнего API:

1. Запросить у владельца проекта входные данные (`API key`, endpoint, сеть, лимиты).
2. Проверить доступность через `curl`/`wscat`.
3. Если smoke-check не прошел, интеграцию не начинать.
4. Кодировать только после успешной проверки.

## Docker

```bash
docker compose up --build
```

В `docker-compose.yml` зафиксирована точная версия Postgres: `postgres:16.4-alpine`.

## Rate-limit recovery runbook

1. Включить `LOG_LEVEL=info` (или `debug` на диагностику).
2. Проверить heartbeat лог watcher: lag/queue/backoff.
3. При росте `backoffMs` сервис не падает, а снижает темп и продолжает обработку.
4. Если lag долго растет, временно увеличить `CHAIN_RPC_MIN_INTERVAL_MS` и/или уменьшить `CHAIN_RECEIPT_CONCURRENCY`.

## History rate-limit/cache runbook

1. `/history` использует in-memory fresh cache (`HISTORY_CACHE_TTL_SEC`) и stale fallback (`HISTORY_STALE_ON_ERROR_SEC`).
2. Лимиты на пользователя: `HISTORY_RATE_LIMIT_PER_MINUTE`.
3. Для inline-кнопок действует отдельный cooldown: `HISTORY_BUTTON_COOLDOWN_SEC`.
4. При лимите/временной ошибке Etherscan бот пытается отдать stale-кэш, иначе возвращает `retryAfter` сообщение.

## Live alert quality runbook

1. Перед отправкой алерт проходит anti-noise suppression:
   `ALERT_MIN_SEND_INTERVAL_SEC` защищает от повторов одного типа события по кошельку/контракту.
2. Нулевые ERC20 transfer события подавляются как шум.
3. Для популярных токенов (USDT/USDC/DAI/WETH) символ и decimals берутся из локального справочника.
4. Метаданные токенов кэшируются in-memory с TTL `TOKEN_META_CACHE_TTL_SEC`.

## Важно по Telegram polling

- Не дергать `getUpdates` вручную (через `curl`), пока бот запущен в polling.
- Иначе Telegram вернет `409 Conflict`, и polling-процесс бота остановится.

## CI

В `.github/workflows/ci.yml` настроены шаги:

1. `npm ci`
2. `npm run lint`
3. `npm run db:validate`
4. `npm run typecheck`
5. `npm run test`
6. `npm run build`
