#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="/opt/whale-alert-bot"
REPO_URL="https://github.com/advortsov/whale-alert-bot.git"
COMPOSE_FILE="docker-compose.prod.yml"

# Загрузить переменные из .env если файл существует
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Параметры SSH (аргументы > env > дефолты)
SSH_HOST="${1:-${DEPLOY_SSH_HOST:-}}"
SSH_USER="${2:-${DEPLOY_SSH_USER:-root}}"
SSH_PORT="${3:-${DEPLOY_SSH_PORT:-22}}"

if [[ -z "$SSH_HOST" ]]; then
  echo "Использование: $0 <host> [user] [port]"
  echo "Или задай DEPLOY_SSH_HOST, DEPLOY_SSH_USER, DEPLOY_SSH_PORT в .env"
  exit 1
fi

SSH_CMD="ssh -o StrictHostKeyChecking=accept-new -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST}"
SCP_CMD="scp -o StrictHostKeyChecking=accept-new -P ${SSH_PORT}"
TMA_ARCHIVE_PATH=""

cleanup() {
  if [[ -n "$TMA_ARCHIVE_PATH" && -f "$TMA_ARCHIVE_PATH" ]]; then
    rm -f "$TMA_ARCHIVE_PATH"
  fi
}

trap cleanup EXIT

echo "==> Деплой на ${SSH_USER}@${SSH_HOST}:${SSH_PORT}"

# Первичная настройка VPS (если передан флаг --init)
if [[ "${4:-}" == "--init" ]] || [[ "${1:-}" == "--init" ]]; then
  echo "==> Первичная настройка VPS..."
  $SSH_CMD 'bash -s' < "$(dirname "$0")/setup-vps.sh"
  echo "==> Настройка завершена. Заполни .env на сервере и запусти деплой снова."
  exit 0
fi

(
  cd "$(dirname "$0")/.."
  if [[ ! -d "./tma/dist" ]]; then
    echo "==> tma/dist не найден. Собираю локально..."
    cd tma
    npm ci --no-audit --no-fund
    npm run build
  fi
)

TMA_ARCHIVE_PATH="$(mktemp "${TMPDIR:-/tmp}/tma-dist.XXXXXX.tgz")"
tar -C "$(dirname "$0")/../tma" -czf "$TMA_ARCHIVE_PATH" dist
echo "==> Копирование собранного tma/dist на VPS..."
$SCP_CMD "$TMA_ARCHIVE_PATH" "${SSH_USER}@${SSH_HOST}:/tmp/tma-dist.tgz"

$SSH_CMD bash -s <<REMOTE_SCRIPT
set -euo pipefail

# Клонировать или обновить репозиторий
if [[ ! -d "${DEPLOY_DIR}" ]]; then
  echo "==> Клонирование репозитория..."
  git clone "${REPO_URL}" "${DEPLOY_DIR}"
else
  echo "==> Обновление репозитория..."
  cd "${DEPLOY_DIR}"
  git fetch origin main
  git reset --hard origin/main
fi

cd "${DEPLOY_DIR}"

# Проверить наличие .env
if [[ ! -f .env ]]; then
  echo "==> .env не найден. Копирую шаблон..."
  cp .env.prod.example .env
  echo ""
  echo "!!! ВАЖНО: Отредактируй ${DEPLOY_DIR}/.env и заполни секреты !!!"
  echo "После этого запусти деплой снова."
  exit 1
fi

# Распаковка TMA-артефакта
echo "==> Распаковка TMA-артефакта..."
if [[ ! -f /tmp/tma-dist.tgz ]]; then
  echo "!!! /tmp/tma-dist.tgz не найден на сервере"
  exit 1
fi

mkdir -p "${DEPLOY_DIR}/tma/dist.new"
rm -rf "${DEPLOY_DIR}/tma/dist.new"/*
tar -xzf /tmp/tma-dist.tgz -C "${DEPLOY_DIR}/tma/dist.new"
rm -rf "${DEPLOY_DIR}/tma/dist.prev"
if [[ -d "${DEPLOY_DIR}/tma/dist" ]]; then
  mv "${DEPLOY_DIR}/tma/dist" "${DEPLOY_DIR}/tma/dist.prev"
fi
mv "${DEPLOY_DIR}/tma/dist.new/dist" "${DEPLOY_DIR}/tma/dist"
rm -rf "${DEPLOY_DIR}/tma/dist.new" "${DEPLOY_DIR}/tma/dist.prev"
rm -f /tmp/tma-dist.tgz

echo "==> Сборка и запуск контейнеров..."
docker compose -f "${COMPOSE_FILE}" up -d postgres prometheus grafana
docker compose -f "${COMPOSE_FILE}" up --build -d --force-recreate app

echo "==> Ожидание запуска (15 сек)..."
sleep 15

# Логи
echo "==> Последние логи приложения:"
docker compose -f "${COMPOSE_FILE}" logs app --tail=30

# Health check
echo ""
echo "==> Health check..."
if curl -sf http://localhost:3000/health; then
  echo ""
  echo "==> Деплой завершён успешно!"
else
  echo ""
  echo "!!! Health check не прошёл. Проверь логи: docker compose -f ${COMPOSE_FILE} logs app"
  exit 1
fi
REMOTE_SCRIPT
