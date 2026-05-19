#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COREGETH_DIR="$ROOT_DIR/clients/qubitor-node/coregeth"

if [[ -n "${GO_BIN:-}" ]]; then
  GO_CMD="$GO_BIN"
elif command -v go1.22.12 >/dev/null 2>&1; then
  GO_CMD="go1.22.12"
elif [[ -x "$HOME/go/bin/go1.22.12" ]]; then
  GO_CMD="$HOME/go/bin/go1.22.12"
else
  GO_CMD="go"
fi

cd "$COREGETH_DIR"
GOWORK=off "$GO_CMD" test ./core/types -run 'QubitorPQ|TestQubitor' -count=1
GOWORK=off "$GO_CMD" test ./core -run 'QubitorPQ|TestQubitor' -count=1
GOWORK=off "$GO_CMD" test ./core/vm -run 'Qubitor|TestIsPrecompiledContractEnabled' -count=1
GOWORK=off "$GO_CMD" test ./internal/ethapi -run 'Qubitor|SendRawPQ' -count=1
GOWORK=off "$GO_CMD" test ./params/types/coregeth -count=1
