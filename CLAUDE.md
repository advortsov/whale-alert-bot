# Whale Alert Bot — правила для Claude Code

## Общие правила

- Всегда отвечай по-русски.
- Комментарии в коде: ясно, коротко, без канцелярита.
- Не делай `git commit` или `git push` без явного запроса.
- Не выполняй разрушительные команды (`rm -rf`, `git reset --hard`) без подтверждения.
- Если нужна информация — задавай конкретные вопросы с минимальным количеством вариантов.
- Если действие затрагивает внешние сервисы или сеть — уточняй перед выполнением.
- Не включай в ответы секреты, токены и приватные ключи.
- Игнорируй при поиске: `dist/`, `node_modules/`, `coverage/`, `build/`, `.idea/`.
- Если не удаётся собрать проект из-за недоступности зависимостей — остановись и уведоми.
- Стиль ответа: сначала краткий итог, затем детали, в конце — следующие шаги (если уместны).
- Сервис и все его зависимости (PostgreSQL, очереди и т.д.) должны быть подняты локально через `docker compose up --build -d` и работать корректно на протяжении всей сессии. Не останавливай контейнеры без явного запроса. Перед любыми изменениями в коде убедись, что сервис запущен; после изменений — пересобери и проверь логи.
- **НИКОГДА** не используй `docker compose down -v`, `docker volume rm` и другие команды, удаляющие volumes/данные БД. Для пересборки — только `docker compose up --build -d`. Данные в базе должны сохраняться между перезапусками.
- Для подключения к БД и другим сервисам всегда используй значения из `.env` / переменных окружения. Не хардкодь креды, URL и другие секреты — бери их из `AppConfigService` или `process.env`.

## MCP серверы

- `context7` — актуальная документация библиотек/фреймворков. Используй, когда вопрос про API, версии или поведение библиотек.
- `github` — работа с GitHub API (issues, PR, репозитории). Используй для операций с GitHub вместо прямых API-вызовов.

## Проект

Telegram-бот на NestJS + TypeScript для мониторинга крупных криптотранзакций (Ethereum, Solana, TRON). Язык кодовой базы — английский, документация и комментарии — русский.

## Стек

- Node.js 22, TypeScript 5.7 (strict), NestJS 11
- PostgreSQL 16.4, Kysely (query builder), Postgrator (миграции)
- Telegraf + nestjs-telegraf (Telegram)
- ethers.js 6 (Ethereum), кастомные адаптеры (Solana, TRON)
- Zod (валидация), Vitest (тесты)

## Архитектура

Core + Ports + Adapters:

- `src/core/ports/` — доменные интерфейсы (rpc, explorers, token-metadata, token-pricing, address)
- `src/integrations/` — реализации адаптеров, группировка по домену (не по вендору)
- `src/features/` — бизнес-логика без прямых зависимостей на вендорные API
- `src/chains/` — chain-specific pipeline адаптеры (Ethereum, Solana, TRON)
- `src/storage/repositories/` — data access через Kysely
- `src/telegram/` — Telegram-хендлеры и команды

Не нарушай dependency direction: features и core **не** импортируют из integrations напрямую — только через DI-токены из `core/ports/`.

## Код-стиль и правила

- **TypeScript strict mode** — `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **Explicit return types** обязательны на функциях и методах модуля (`explicit-function-return-type`, `explicit-module-boundary-types`)
- **Type imports**: `import { type Foo }` (inline type imports)
- **Import order**: builtins/external → internal → parent/sibling, алфавитная сортировка, пустая строка между группами
- **No `any`** — `@typescript-eslint/no-explicit-any: error`
- **No unused imports** — автоматически удаляются
- **Unused vars**: допускается `_` префикс
- **Prettier**: single quotes, trailing commas, semicolons, 100 chars width, LF
- **No floating promises** — все async вызовы должны быть awaited или обработаны
- **Exception messages** — текст в `throw new Error(...)` и логах только на английском. Русский допускается только в user-facing сообщениях (Telegram-ответы пользователю).

## Команды качества

```bash
npm run lint          # ESLint (--max-warnings 0)
npm run typecheck     # tsc --noEmit
npm run test          # vitest run
npm run build         # nest build
npm run check         # полный gate (lint + db:validate + typecheck + test + build)
npm run precommit     # format:write + lint + typecheck + test + build
```

**Перед коммитом** — обязательный чеклист:

1. `npm run precommit` — исправить все ошибки линтера, типов и сборки до зелёного прогона.
2. `npm run test` — все тесты должны проходить. Если что-то сломалось — починить.
3. `docker compose up --build -d` — поднять проект локально, убедиться что контейнер стартует и в логах (`docker compose logs -f --tail=50`) нет ошибок. Не останавливать контейнеры — сервис должен работать постоянно.
4. Коммит и пуш с осмысленным сообщением в стиле проекта: `type(scope): описание` (например `feat(tron): add live watcher pipeline`). Типы: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.

Если правишь только конфиг/документацию без TS — хватит `npm run lint`.

## Release notes

- Файл: `release-notes/latest.md`.
- **Append-only**: при каждом релизе **дописывай** новый блок **сверху** файла, не удаляя предыдущие записи. Формат блока: `## vX.Y.Z` + список изменений.
- Скрипт `npm run release:notes -- --notes-file release-notes/latest.md` читает весь файл и отправляет в Telegram.

## Тесты

- Unit-тесты: `*.spec.ts` рядом с исходниками, vitest
- E2E: `test/**/*.e2e-spec.ts`, компилируются через `tsconfig.test.json`
- Telegram harness: `npm run test:telegram:harness`
- При добавлении логики — покрывай тестами. Не добавляй тесты для тривиальных обёрток

## База данных

- Миграции: `database/migrations/`, формат `NNN.do.name.sql` / `NNN.undo.name.sql`
- Checksum validation включена — не редактируй применённые миграции
- Команды: `npm run db:migrate`, `npm run db:validate`, `npm run db:info`
- Все chain-specific данные помечаются `chain_key`

## Конфигурация

- Env-переменные описаны в `.env.example`
- Типы конфигов: `src/config/app-config.types.ts`
- Валидация через Zod при старте приложения

## Ключевые соглашения

- Логирование chain streams: `[ETH]`, `[SOL]`, `[TRON]` префиксы
- Новая сеть = новый адаптер в `src/chains/`, порты в `src/core/ports/`, интеграция в `src/integrations/`
- Внешние API: smoke-check перед интеграцией (примеры в README)
- Не дёргать Telegram `getUpdates` вручную при запущенном polling

## Правила TypeScript (все проекты)

### Архитектурные границы
- SQL-запросы и обращения к БД — только внутри репозиториев (`Repository`).
- На каждый домен — отдельный сервис. Сервис не инжектит репозиторий чужого домена — только через сервис этого домена.
- SOLID без фанатизма: не создавай лишних интерфейсов там, где код чист без них.

### Типизация
- Всегда указывай возвращаемые типы функций.
- Не объявляй сложные типы возврата inline (`f(): {field: number}`). Если больше одного поля — выноси в `interface` или `type`.
- Явные модификаторы доступа: `public`, `private`, `protected` для методов классов.
- `any` запрещён — используй `unknown` с type guards.
- `interface` для описания форм объектов, `type` для union/intersection.
- Используй `as const`, `satisfies`, branded types для ID.

### Стиль
- Immutability: не мутируй параметры функций. Spread-оператор, `toSorted`, `map`, `filter`.
- Чистые функции без побочных эффектов. Side-effects — на краях системы.
- Только `async/await` + `try/catch`. Не использовать цепочки `.then()`.

## Правила Java & Spring Boot (все проекты)

### Архитектурные границы
- SQL и обращения к БД — только внутри `@Repository`.
- На каждый домен — отдельный сервис, маппер и репозиторий.
- Сервис не инжектит репозиторий чужого домена.
- Конструкторное внедрение зависимостей, без `@Autowired` на полях.

### Java-стиль
- Java 21+: records для DTO, sealed classes, pattern matching, `var` при очевидном типе.
- Явные return types и модификаторы доступа.
- `record` для DTO/Request/Response. JPA-сущности — мутабельные классы.
- Stream API для коллекций, method references.
- Не мутировать параметры методов. Новые объекты через копирующие конструкторы или билдеры.
- `@Transactional` на уровне сервисов, не репозиториев.

### Тесты (Java)
- Не использовать `.jsonPath()` — маппить в объект через `objectMapper`.
- Не использовать Lombok `val`. Использовать `@Builder`.
- Тестовые объекты: `enhancedRandom.nextObject(Class.class).toBuilder()`, при первом сохранении `.id(null)`.
- `@DisplayName` на русском.
- Без рефлексии.
- Комментарии в тестах: только `// given`, `// when`, `// then`.
- `assertTrue`/`assertFalse` — с текстовым сообщением на английском. Другие ассерты — без.
- Покрывать все ветки. Тестировать только public методы.
- Интеграционные тесты: мокать только Feign-клиенты (внешние системы). Не сохранять во View-репозитории.
- Переиспользовать константы из `TestConstants.java`
