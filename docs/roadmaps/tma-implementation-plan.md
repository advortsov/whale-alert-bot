# План исполнения TMA с отдельным коммитом на каждую фазу

## Краткий итог
Делаем 5 коммитов:
1. Фаза 0: сохраняем план в репо как документ.
2. Фаза 1: backend (TMA auth/init + config + CORS).
3. Фаза 2: frontend SPA `tma/`.
4. Фаза 3: интеграция с Telegram-ботом.
5. Фаза 4: деплой и эксплуатационная документация.

Перед каждым коммитом: `npm run precommit`, локальный запуск `npm run start:test`, проверка `GET /health`.

## Фаза 0 — Документирование плана
1. Создать `docs/roadmaps/tma-implementation-plan.md`.
2. Сохранить согласованный план TMA.
3. Добавить ссылку в README.

Коммит:
`docs(tma): add implementation roadmap for telegram mini app rollout`

## Фаза 1 — Backend TMA (Auth + Init + Config + CORS)
1. Добавить `POST /api/auth/tma` (валидация `initData` через HMAC `WebAppData`).
2. Добавить `GET /api/tma/init` (JWT guarded) с ответом:
   - `wallets`
   - `settings`
   - `todayAlertCount`
3. Добавить в `WalletEventsRepository` метод `countTodayEventsByUser(userId)`.
4. Добавить конфиг:
   - `TMA_ENABLED`
   - `TMA_BASE_URL`
   - `TMA_BOT_USERNAME`
   - `TMA_ALLOWED_ORIGINS`
5. Включить CORS в `src/main.ts`.
6. Подключить `TmaModule` в `ApiModule` с учетом `TMA_ENABLED`.

Коммит:
`feat(api): add tma auth via initData and aggregated /api/tma/init endpoint`

## Фаза 2 — Frontend SPA `tma/`
1. Создать отдельный фронт-проект в `tma/`.
2. Стек:
   - React 19 + Vite 6
   - `@telegram-apps/sdk-react`
   - `@tanstack/react-query`
   - `react-router`
3. Реализовать:
   - AuthProvider (`initDataRaw -> /api/auth/tma -> sessionStorage`)
   - страницы: `Dashboard`, `Wallets`, `WalletDetail`, `Settings`, `AddWallet`
   - API-клиент с auto re-login на `401`
   - deep-link parser `startapp=wallet_<id>`
   - theme params / BackButton / MainButton / Haptic hooks

Коммит:
`feat(tma): add react mini app shell with auth provider, routing and core pages`

## Фаза 3 — Интеграция с Telegram-ботом
1. Добавить команду `/app`.
2. Добавить `web_app` кнопку:
   - в `/app`
   - в карточке `/wallet #id`
3. Добавить кнопку `📱 TMA` в live-alert inline keyboard:
   - `t.me/<bot>?startapp=wallet_<id>`

Коммит:
`feat(telegram): add /app web_app entrypoint and tma deeplink actions in wallet/alerts`

## Фаза 4 — Деплой и эксплуатационная документация
1. Обновить прод-конфиги и README:
   - env-переменные TMA
   - шаги сборки `tma`
   - nginx `location /tma/`
   - BotFather setup
2. Добавить `docs/tma-runbook.md`.
3. Проверить совместимость с `docker-compose.prod.yml` и CD.

Коммит:
`docs(deploy): add tma nginx rollout guide and production configuration notes`

## Обязательные тесты
1. Unit:
   - `tma-auth.service.spec.ts`
   - `tma-init.service.spec.ts`
2. Repository integration:
   - `countTodayEventsByUser`
3. API scenario:
   - `/api/auth/tma`
   - `/api/tma/init`
4. Telegram integration:
   - `/app`
   - кнопка web_app в кошельке
   - deeplink `📱 TMA` в alert
5. Frontend smoke:
   - auth flow + deep-link routing

## Assumptions / defaults
1. Текущие `/api/auth/telegram` и команды бота сохраняем без ломки.
2. `todayAlertCount` считаем по UTC.
3. На MVP без WebSocket, только polling.
4. `TMA_ENABLED=false` по умолчанию.
5. Каждая фаза идет отдельным коммитом.
