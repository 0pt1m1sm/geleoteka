#!/bin/bash
# Вызов Timeweb Cloud API с токеном из конфига MCP (~/.claude.json).
# Использование: twc-api.sh <путь> [доп. аргументы curl]
# Пример: twc-api.sh /api/v1/apps
#         twc-api.sh /api/v1/apps/123/deploy -X POST
# Хост зашит намертво — скрипт не может обращаться к другим адресам.
set -euo pipefail
TOKEN=$(jq -r '.projects["/Users/alex/claude-dev/Geleoteka"].mcpServers.timeweb.env.TIMEWEB_TOKEN' ~/.claude.json)
path="$1"; shift
exec curl -s --max-time 30 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$@" "https://api.timeweb.cloud${path}"
