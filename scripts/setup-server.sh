#!/usr/bin/env bash
# Запускать НА сервере из папки проекта:
#   bash scripts/setup-server.sh

set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. Установите Node 20+ и повторите."
  exit 1
fi

if [ ! -f .env ]; then
  echo "Создайте файл .env с BOT_TOKEN и ADMIN_USERNAMES"
  exit 1
fi

npm ci --omit=dev
npm install -g pm2

pm2 delete ittop-buffet-bot 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

echo ""
echo "Готово. Статус:"
pm2 status
echo ""
echo "Логи: pm2 logs ittop-buffet-bot"
