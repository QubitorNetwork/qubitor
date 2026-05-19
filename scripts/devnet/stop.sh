#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NETWORK="${QUBITOR_NETWORK:-${QUBITOR_NETWORK_PROFILE:-devnet}}"
DATA_DIR="${QUBITOR_DATA_DIR:-$ROOT_DIR/data/$NETWORK}"
PID_FILE="$DATA_DIR/qubitor-node.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "[qubitor-$NETWORK] no pid file"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" >/dev/null 2>&1; then
  kill "$PID"
  echo "[qubitor-$NETWORK] stopped pid $PID"
else
  echo "[qubitor-$NETWORK] pid $PID is not running"
fi
rm -f "$PID_FILE"
