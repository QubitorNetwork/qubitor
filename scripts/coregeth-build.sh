#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COREGETH_DIR="$ROOT_DIR/clients/qubitor-node/coregeth"
OUT="${QUBITOR_COREGETH_OUT:-$ROOT_DIR/build/bin/qubitor-geth}"

if [[ -n "${GO_BIN:-}" ]]; then
  GO_CMD="$GO_BIN"
elif command -v go1.22.12 >/dev/null 2>&1; then
  GO_CMD="go1.22.12"
elif [[ -x "$HOME/go/bin/go1.22.12" ]]; then
  GO_CMD="$HOME/go/bin/go1.22.12"
else
  GO_CMD="go"
fi

mkdir -p "$(dirname "$OUT")"

cd "$COREGETH_DIR"
echo "[qubitor-coregeth] building $OUT"
GOWORK=off "$GO_CMD" build -trimpath -o "$OUT" ./cmd/geth
"$OUT" version | sed -n '1,6p'
echo "[qubitor-coregeth] built $OUT"
