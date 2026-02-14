#!/usr/bin/env bash
# Первичная настройка VPS для whale-alert-bot
# Запускать на самом сервере (или через deploy.sh --init)
set -euo pipefail

DEPLOY_DIR="/opt/whale-alert-bot"
REPO_URL="https://github.com/advortsov/whale-alert-bot.git"

echo "==> Обновление пакетов..."
apt-get update -y

# Docker
if ! command -v docker &> /dev/null; then
  echo "==> Установка Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "==> Docker уже установлен: $(docker --version)"
fi

# Docker Compose plugin
if ! docker compose version &> /dev/null; then
  echo "==> Установка Docker Compose plugin..."
  apt-get install -y docker-compose-plugin
else
  echo "==> Docker Compose уже установлен: $(docker compose version)"
fi

# Git
if ! command -v git &> /dev/null; then
  echo "==> Установка Git..."
  apt-get install -y git
fi

# curl (для health check)
if ! command -v curl &> /dev/null; then
  echo "==> Установка curl..."
  apt-get install -y curl
fi

# Клонирование репозитория
if [[ ! -d "${DEPLOY_DIR}" ]]; then
  echo "==> Клонирование репозитория..."
  git clone "${REPO_URL}" "${DEPLOY_DIR}"
else
  echo "==> Репозиторий уже существует: ${DEPLOY_DIR}"
fi

cd "${DEPLOY_DIR}"

# Создание .env из шаблона
if [[ ! -f .env ]]; then
  cp .env.prod.example .env
  echo ""
  echo "============================================"
  echo " VPS настроен!"
  echo ""
  echo " Следующие шаги:"
  echo " 1. Отредактируй ${DEPLOY_DIR}/.env"
  echo "    и заполни все секреты (BOT_TOKEN,"
  echo "    POSTGRES_PASSWORD, API ключи и т.д.)"
  echo ""
  echo " 2. Запусти деплой:"
  echo "    npm run deploy <host>"
  echo "============================================"
else
  echo "==> .env уже существует, пропускаю создание."
fi
