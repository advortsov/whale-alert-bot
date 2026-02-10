# Последний релиз

- Добавлен TRON history fallback через TronGrid (native TRX + TRC20) для команды `/history`.
- История и ссылки на транзакции для TRON теперь корректно отображаются через Tronscan.
- Обновлены тексты бота и README: TRON включен в поддерживаемые сети для истории.
- Добавлены/обновлены тесты: TRON explorer adapter, history router, tracking history links, config defaults.
- Исправлен старт в Docker при пустом `TRON_GRID_API_KEY` (пустое значение корректно интерпретируется как `null`).
