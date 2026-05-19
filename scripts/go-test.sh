#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if command -v go1.22.12 >/dev/null 2>&1; then
  GO_BIN="go1.22.12"
elif [[ -x "$HOME/go/bin/go1.22.12" ]]; then
  GO_BIN="$HOME/go/bin/go1.22.12"
else
  GO_BIN="go"
fi

cd "$ROOT_DIR"
"$GO_BIN" test ./clients/qubitor-node/...
