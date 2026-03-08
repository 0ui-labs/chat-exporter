#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TSX_LOADER="$ROOT_DIR/apps/server/node_modules/tsx/dist/loader.mjs"
SCRIPT_PATH="$ROOT_DIR/apps/server/src/scripts/format-adjustments-smoke.ts"
BETTER_SQLITE_ENTRY="$ROOT_DIR/apps/server/node_modules/better-sqlite3"

declare -a CANDIDATES=()

if [[ -n "${SMOKE_NODE_BINARY:-}" ]]; then
  CANDIDATES+=("$SMOKE_NODE_BINARY")
fi

if command -v node >/dev/null 2>&1; then
  CANDIDATES+=("$(command -v node)")
fi

if [[ -d "${HOME}/.nvm/versions/node" ]]; then
  while IFS= read -r candidate; do
    CANDIDATES+=("$candidate")
  done < <(find "${HOME}/.nvm/versions/node" -path "*/bin/node" -type f | sort)
fi

NODE_BINARY=""

for candidate in "${CANDIDATES[@]}"; do
  if [[ ! -x "$candidate" ]]; then
    continue
  fi

  if "$candidate" -e "const Database = require(process.argv[1]); const db = new Database(':memory:'); db.close();" "$BETTER_SQLITE_ENTRY" >/dev/null 2>&1; then
    NODE_BINARY="$candidate"
    break
  fi
done

if [[ -z "$NODE_BINARY" ]]; then
  echo "No compatible Node.js binary could load better-sqlite3." >&2
  echo "Set SMOKE_NODE_BINARY to a working Node 18/20 installation and retry." >&2
  exit 1
fi

exec "$NODE_BINARY" --import "$TSX_LOADER" "$SCRIPT_PATH"
