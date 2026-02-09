# Whale Alert Bot

Telegram-бот на `NestJS + TypeScript` для отслеживания активности китов в Ethereum.

## Стек

- Node.js 22
- NestJS 11
- Telegram: `telegraf` + `nestjs-telegraf`
- Postgres + Kysely
- SQL миграции: Postgrator (`checksum` включен)
- Тесты: `vitest` (без `jest`)

## Команды бота

- `/track <address> [label]`
- `/list`
- `/untrack <address|id>`
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
- v1 провайдеры: Alchemy (primary), Infura (fallback).

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
