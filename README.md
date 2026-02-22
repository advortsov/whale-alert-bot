# Whale Alert Bot

Telegram-бот на `NestJS + TypeScript` для отслеживания активности китов в Ethereum, Solana и TRON.

## Стек

- Node.js 22
- NestJS 11
- Telegram: `telegraf` + `nestjs-telegraf`
- Postgres + Kysely
- SQL миграции: Postgrator (`checksum` включен)
- Тесты: `vitest`

## Roadmap

- План внедрения Telegram Mini App (TMA): `docs/roadmaps/tma-implementation-plan.md`
- Runbook деплоя и эксплуатации TMA: `docs/tma-runbook.md`

## Команды бота

- `/track <eth|sol|tron> <address> [label]` - добавить кошелек в отслеживание.
- `/list` - список отслеживаемых кошельков c `#id`.
- `/wallet <#id>` - карточка кошелька с кнопками действий.
- `/app` - открыть Telegram Mini App.
- `/untrack <address|id>` - удалить кошелек из отслеживания.
- `/history <address|#id> [limit] [kind] [direction]` - история по кошельку (`kind=all|eth|erc20`, `direction=all|in|out`).
- `/status` - статус рантайма, лимитов и версии приложения.
- `/threshold <amount|off>` - единый USD-порог для алертов.
- `/filter min_amount_usd <amount|off>` - legacy alias для `/threshold` (отдельной логики больше нет).
- `/filter cex <off|in|out|all>` - фильтр переводов относительно CEX.
- `/filter type <all|buy|sell|transfer>` - фильтр типа событий.
- `/filter include_dex <dex|off>` - оставить только выбранные DEX.
- `/filter exclude_dex <dex|off>` - исключить DEX из алертов.
- `/filters` - показать текущие фильтры и подсказки по командам.
- `/walletfilters <#id>` - фильтры конкретного кошелька.
- `/wfilter <#id> <transfer|swap> <on|off>` - включить/выключить transfer/swap для кошелька.
- `/quiet <HH:mm-HH:mm|off>` - тихие часы в пользовательской таймзоне.
- `/tz <Area/City>` - выставить таймзону для quiet hours.
- `/mute <minutes|off>` - временно выключить все алерты.
- `/help` - полная справка с примерами.

## REST API

Полный REST API для веб- и мобильных клиентов с JWT-аутентификацией через Telegram Login Widget.

### Аутентификация

API использует JWT-токены. Для получения токенов нужно авторизоваться через Telegram Login Widget.

**Переменные окружения:**

```env
JWT_SECRET=your-secret-key          # обязателен в production
JWT_ACCESS_TTL_SEC=900              # access token TTL (по умолчанию 15 мин)
JWT_REFRESH_TTL_SEC=604800          # refresh token TTL (по умолчанию 7 дней)
```

**Шаг 1. Получение токенов (Telegram Login Widget)**

Telegram Login Widget отдаёт объект с данными пользователя и подписью `hash`.
Этот объект отправляется в `POST /api/auth/telegram`:

```bash
curl -X POST http://localhost:3000/api/auth/telegram \
  -H "Content-Type: application/json" \
  -d '{
    "id": 123456789,
    "first_name": "User",
    "username": "myuser",
    "auth_date": 1771529725,
    "hash": "<hash из Telegram Login Widget>"
  }'
```

Ответ:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

Верификация: сервер проверяет `hash` через HMAC-SHA256(SHA256(BOT_TOKEN), data_check_string). `auth_date` не должен быть старше 5 минут.

Если пользователь ещё не существует в БД, он создаётся автоматически при первом входе.

**Шаг 2. Использование access token**

Все защищённые эндпоинты требуют заголовок `Authorization: Bearer <accessToken>`:

```bash
curl http://localhost:3000/api/wallets \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**Шаг 3. Обновление токенов**

Когда access token истекает, используйте refresh token для получения новой пары:

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "eyJhbGciOiJIUzI1NiIs..."}'
```

### Эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/telegram` | Вход через Telegram Login Widget |
| POST | `/api/auth/refresh` | Обновление пары токенов |
| POST | `/api/wallets` | Добавить кошелёк (`{ chainKey, address, label? }`) |
| GET | `/api/wallets` | Список кошельков |
| GET | `/api/wallets/:id` | Детали кошелька |
| DELETE | `/api/wallets/:id` | Удалить кошелёк |
| POST | `/api/wallets/:id/mute` | Замьютить кошелёк (`{ minutes }`) |
| GET | `/api/wallets/:id/filters` | Фильтры кошелька |
| PATCH | `/api/wallets/:id/filters` | Обновить фильтр (`{ target, enabled }`) |
| GET | `/api/wallets/:id/history` | История транзакций (`?limit&offset&kind&direction`) |
| GET | `/api/settings` | Настройки пользователя |
| PATCH | `/api/settings` | Обновить настройки (partial) |
| GET | `/api/status` | Статус, настройки и квота history |

Без токена или с невалидным токеном все защищённые эндпоинты возвращают `401 Unauthorized`.

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
- `npm run test:telegram:harness` (локальный harness Telegram без внешнего API)
- `npm run release:notes` (отправка release notes в Telegram-чат)

Перед любым деплоем обязательно выполняется минимум `npm run lint`.
Перед коммитом и перед деплоем в проекте используется `npm run precommit`.

## Версия приложения

- Версия берется из `APP_VERSION` (если задано) или из `package.json`.
- Команда `/status` показывает текущую версию приложения в ответе бота.
- Для Docker можно задавать `APP_VERSION` через `docker-compose.yml`/`.env`.

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
- backoff и очередь изолированы по ключу провайдера (`primary:<chain>`, `fallback:<chain>`), чтобы проблемы Solana не замедляли ETH/TRON.
- при `429` на primary включается cooldown primary на время текущего backoff, в этот период запросы идут сразу в fallback (меньше WARN и меньше лишних 429).
- для Solana стартовый backoff отдельный: `CHAIN_SOLANA_BACKOFF_BASE_MS=5000`; авто-сброс Solana backoff отключен, чтобы не возвращаться к `429`-шторму.
- для Solana/TRON добавлен bounded catchup и контролируемая деградация очереди (retain tail window), чтобы не срывать поток при burst.
- v1 провайдеры: Alchemy (primary), Infura (fallback).

## Multichain-ready архитектура (Core + Adapters, домены)

Текущий runtime поддерживает Ethereum + Solana + TRON.
Для TRON доступны и history fallback, и live watcher (включается отдельно через `TRON_WATCHER_ENABLED`).

- `src/core/chains`: ключи сетей и базовые chain-контракты (`ChainKey`).
- `src/core/ports/rpc`: доменный порт RPC/block stream.
- `src/core/ports/explorers`: доменный порт истории транзакций.
- `src/core/ports/token-metadata`: доменный порт метаданных токенов.
- `src/integrations/*`: реализации адаптеров по доменам (а не по вендорам).
- `src/features/*`: бизнес-логика Telegram/Tracking без прямых зависимостей на конкретный API-вендор.

Логирование стримов:
- Ethereum: префикс `[ETH]`
- Solana: префикс `[SOL]`
- TRON: префикс `[TRON]`
- У каждой сети есть heartbeat-лог с lag/queue/backoff, а также `queueUsedPct`, `catchupDebt`, `degradationMode`.

Технические ограничения этапа:

- production-фокус пока на `ethereum_mainnet`, Solana включается staged-rollout (см. ниже);
- для `tron_mainnet` live-классификация на этом этапе ограничена событиями `TRANSFER` (v1);
- все chain-specific данные в БД помечаются `chain_key`.

TRON history fallback в текущем этапе:

- primary путь: локальные `wallet_events` (если события уже есть в БД);
- fallback путь: TronGrid API (`/transactions` для TRX и `/transactions/trc20` для токенов);
- объединение TRX + TRC20 в единый список истории с фильтрами `kind`/`direction`;
- если TronGrid возвращает `HTTP 400`, адаптер автоматически повторяет запрос с более мягкими query-параметрами;
- ссылки в истории для TRON строятся через `TRONSCAN_TX_BASE_URL`.

## Параметры watcher (безопасные defaults для free API)

```env
CHAIN_WATCHER_ENABLED=false
SOLANA_WATCHER_ENABLED=false
TRON_WATCHER_ENABLED=false
CHAIN_RECEIPT_CONCURRENCY=2
CHAIN_RPC_MIN_INTERVAL_MS=350
CHAIN_BACKOFF_BASE_MS=1000
CHAIN_SOLANA_BACKOFF_BASE_MS=5000
CHAIN_BACKOFF_MAX_MS=60000
CHAIN_BLOCK_QUEUE_MAX=120
CHAIN_SOLANA_QUEUE_MAX=120
CHAIN_TRON_QUEUE_MAX=120
CHAIN_SOLANA_CATCHUP_BATCH=40
CHAIN_TRON_CATCHUP_BATCH=40
CHAIN_SOLANA_POLL_INTERVAL_MS=2000
CHAIN_TRON_POLL_INTERVAL_MS=2000
CHAIN_HEARTBEAT_INTERVAL_SEC=60
CHAIN_REORG_CONFIRMATIONS=2
SOLANA_HELIUS_HTTP_URL=https://api.mainnet-beta.solana.com
SOLANA_HELIUS_WSS_URL=wss://api.mainnet-beta.solana.com
SOLANA_PUBLIC_HTTP_URL=https://solana-rpc.publicnode.com
SOLANA_PUBLIC_WSS_URL=wss://solana-rpc.publicnode.com
TRON_PRIMARY_HTTP_URL=https://api.trongrid.io
TRON_FALLBACK_HTTP_URL=https://api.trongrid.io
ETHERSCAN_API_BASE_URL=https://api.etherscan.io/v2/api
ETHERSCAN_API_KEY=your_free_key
TRON_GRID_API_BASE_URL=https://api.trongrid.io
TRON_GRID_API_KEY=
TRONSCAN_TX_BASE_URL=https://tronscan.org/#/transaction/
COINGECKO_API_BASE_URL=https://api.coingecko.com/api/v3
COINGECKO_TIMEOUT_MS=8000
PRICE_CACHE_MAX_ENTRIES=1000
PRICE_CACHE_FRESH_TTL_SEC=120
PRICE_CACHE_STALE_TTL_SEC=600
HISTORY_CACHE_TTL_SEC=120
HISTORY_RATE_LIMIT_PER_MINUTE=12
HISTORY_BUTTON_COOLDOWN_SEC=3
HISTORY_STALE_ON_ERROR_SEC=600
ALERT_MIN_SEND_INTERVAL_SEC=10
TOKEN_META_CACHE_TTL_SEC=3600
```

Fail-fast правила:
- если `CHAIN_WATCHER_ENABLED=true`, то `ETH_ALCHEMY_WSS_URL` и `ETH_INFURA_WSS_URL` обязательны;
- если `SOLANA_WATCHER_ENABLED=true`, то обязательны все: `SOLANA_HELIUS_HTTP_URL`, `SOLANA_HELIUS_WSS_URL`, `SOLANA_PUBLIC_HTTP_URL`, `SOLANA_PUBLIC_WSS_URL`.
- если `TRON_WATCHER_ENABLED=true`, то обязательны `TRON_PRIMARY_HTTP_URL` и `TRON_FALLBACK_HTTP_URL`.

Важно по данным в БД:
- события в `wallet_events`/`processed_events` появляются только для сетей, где watcher включен (`*_WATCHER_ENABLED=true`);
- для сети без tracked-кошельков событий тоже не будет (нечего матчить).

## Workflow внешних API

Перед интеграцией любого внешнего API:

1. Запросить у владельца проекта входные данные (`API key`, endpoint, сеть, лимиты).
2. Проверить доступность через `curl`/`wscat`.
3. Если smoke-check не прошел, интеграцию не начинать.
4. Кодировать только после успешной проверки.

### Smoke-check примеры (free tier)

Alchemy (HTTP):

```bash
curl https://eth-mainnet.g.alchemy.com/v2/<API_KEY> \
  --request POST \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --data '{"id":1,"jsonrpc":"2.0","method":"eth_blockNumber"}'
```

Infura (HTTP):

```bash
curl https://mainnet.infura.io/v3/<API_KEY> \
  --request POST \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --data '{"id":1,"jsonrpc":"2.0","method":"eth_blockNumber"}'
```

Etherscan history endpoint:

```bash
curl "https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&sort=desc&page=1&offset=5&apikey=<API_KEY>"
```

Solana RPC (HTTP + WS):

```bash
SOLANA_HELIUS_HTTP_URL=https://api.mainnet-beta.solana.com \
SOLANA_PUBLIC_HTTP_URL=https://solana-rpc.publicnode.com \
SOLANA_HELIUS_WSS_URL=wss://api.mainnet-beta.solana.com \
SOLANA_PUBLIC_WSS_URL=wss://solana-rpc.publicnode.com \
npm run smoke:solana
```

Проверяется:
- `getSlot`
- `getLatestBlockhash`
- `getSignaturesForAddress`
- WS `slotSubscribe` для primary/fallback.

TronGrid history endpoint:

```bash
curl "https://api.trongrid.io/v1/accounts/TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7/transactions?only_confirmed=true&order_by=block_timestamp,desc&limit=3"
curl "https://api.trongrid.io/v1/accounts/TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7/transactions/trc20?limit=3"
```

TRON watcher endpoint (HTTP polling):

```bash
curl -X POST "https://api.trongrid.io/wallet/getnowblock" \
  -H "content-type: application/json" \
  -d '{}'

curl -X POST "https://api.trongrid.io/wallet/getblockbynum" \
  -H "content-type: application/json" \
  -d '{"num": 80000000, "visible": true}'
```

## Docker

```bash
docker compose up --build
```

В `docker-compose.yml` зафиксирована точная версия Postgres: `postgres:16.4-alpine`.

## Правила релизов и документации

После каждой доработки:

1. Обновить README и описать добавленный функционал.
2. Обновить список изменений для релиза (например, в `release-notes/latest.md`).
3. Прогнать `npm run precommit`.
4. Выполнить деплой.
5. Отправить release notes в Telegram-чат бота с версией приложения.

Пример отправки release notes:

```bash
set -a && source .env && set +a
npm run release:notes -- \
  --notes-file release-notes/latest.md \
  --title "Что нового:"
```

Альтернатива без файла:

```bash
set -a && source .env && set +a
npm run release:notes -- \
  --highlights "Fix Solana track parsing|Improve wallet card UX|Add tests for callbacks"
```

Dry-run (проверка текста без отправки):

```bash
npm run release:notes -- \
  --dry-run \
  --highlights "Fix Solana track parsing|Improve wallet card UX"
```

## Локальный Telegram harness

Для локальной проверки сценариев бота без реального Telegram API:

```bash
npm run test:telegram:harness
```

Покрытые сценарии:

1. Многострочные команды в одном сообщении.
2. Команда `/status` (runtime + пользовательский статус).
3. Callback-история по `walletId` (`wallet_history:*`) с policy `source=callback`.

## Rate-limit recovery runbook

1. Включить `LOG_LEVEL=info` (или `debug` на диагностику).
2. Проверить heartbeat лог watcher: lag/queue/backoff.
3. При росте `backoffMs` сервис не падает, а снижает темп и продолжает обработку.
4. Если lag долго растет, временно увеличить `CHAIN_RPC_MIN_INTERVAL_MS` и/или уменьшить `CHAIN_RECEIPT_CONCURRENCY`.
5. `CHAIN_REORG_CONFIRMATIONS` задает сколько подтверждений ждать перед обработкой блока.
6. На старте watcher восстанавливается из `chain_checkpoints` и догоняет пропущенные finalized блоки.

## Solana staged rollout runbook

1. Стартовый режим:
   `SOLANA_WATCHER_ENABLED=false`, Solana доступна через `/track sol ...` и history fallback без live-alert потока.
2. Перед включением:
   проверить `SOLANA_HELIUS_*` и `SOLANA_PUBLIC_*` через `npm run smoke:solana`.
3. Включение:
   выставить `SOLANA_WATCHER_ENABLED=true`, перезапустить сервис, проверить `GET /health`.
4. Проверка после включения:
   смотреть логи `solana watcher`, lag/queue/backoff и наличие fallback-переключений.
5. Деградация:
   при проблемах primary используется fallback endpoint; если недоступны оба, Solana поток деградирует, но сервис остается живым и продолжает ETH.
6. Откат:
   вернуть `SOLANA_WATCHER_ENABLED=false`, перезапустить сервис, убедиться что `/health` в статусе `ok`.

## History rate-limit/cache runbook

1. `/history` использует in-memory fresh cache (`HISTORY_CACHE_TTL_SEC`) и stale fallback (`HISTORY_STALE_ON_ERROR_SEC`).
2. Лимиты на пользователя: `HISTORY_RATE_LIMIT_PER_MINUTE`.
3. Для inline-кнопок действует отдельный cooldown: `HISTORY_BUTTON_COOLDOWN_SEC`.
4. При лимите/временной ошибке Etherscan бот пытается отдать stale-кэш, иначе возвращает `retryAfter` сообщение.

## UX сценарии карточки кошелька

Основной tap-flow без ручного ввода адреса:

1. `/list` -> тап по `📁 #id label`.
2. Открывается карточка кошелька с сетью, фильтрами и последними локальными событиями.
3. Доступные inline-действия:
   `📜 История` (all), `🪙 ERC20`, `⚙️ Фильтры`, `🔄 Обновить`, `🗑 Удалить`.
4. Пагинация/обновление истории выполняются callback-кнопками и учитывают limit/cooldown/rate-limit политику.

## Live alert quality runbook

1. Перед отправкой алерт проходит anti-noise suppression:
   `ALERT_MIN_SEND_INTERVAL_SEC` защищает от повторов одного типа события по кошельку/контракту.
2. Нулевые ERC20 transfer события подавляются как шум.
3. Для популярных токенов (USDT/USDC/DAI/WETH) символ и decimals берутся из локального справочника.
4. Метаданные токенов кэшируются in-memory с TTL `TOKEN_META_CACHE_TTL_SEC`.

## Важно по Telegram polling

- Не дергать `getUpdates` вручную (через `curl`), пока бот запущен в polling.
- Иначе Telegram вернет `409 Conflict`, и polling-процесс бота остановится.

## Telegram Mini App (TMA, phase 2)

В репозитории добавлен отдельный SPA-проект в `/Users/advortsov/pet/whale-alert-bot/tma`:

1. Стек: `React 19`, `Vite 6`, `@telegram-apps/sdk-react`, `@tanstack/react-query`, `react-router-dom`.
2. Базовые страницы: `Dashboard`, `Wallets`, `WalletDetail`, `Settings`, `AddWallet`.
3. Реализован TMA auth flow:
   `initDataRaw -> POST /api/auth/tma -> JWT -> запросы к API`.
4. Реализован deep-link парсинг `startapp=wallet_<id>` с переходом на карточку кошелька.
5. Базовый build фронтенда:

```bash
cd tma
npm install
npm run build
```

По умолчанию backend-side флаг остается выключенным:
`TMA_ENABLED=false`.

## Telegram Mini App (TMA, phase 3 bot integration)

В Telegram-бот добавлены точки входа в Mini App:

1. Команда `/app` отправляет `web_app` кнопку `📱 Открыть приложение`.
2. В карточке кошелька (`/wallet #id`) добавлена `web_app` кнопка `📱 Открыть в TMA`.
3. В live-alert добавлена deep-link кнопка `📱 TMA`:
   `https://t.me/<bot_username>?startapp=wallet_<walletId>`.

Для корректной работы нужны:

1. `TMA_BASE_URL` — публичный URL Mini App (например `https://domain/tma`).
2. `TMA_BOT_USERNAME` — username бота для deep-link из алертов.

## CI

В `.github/workflows/ci.yml` настроены шаги:

1. `npm ci`
2. `npm run lint`
3. `npm run db:validate`
4. `npm run typecheck`
5. `npm run test`
6. `npm run build`
