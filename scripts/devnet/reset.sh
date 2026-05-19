#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NETWORK="${QUBITOR_NETWORK:-${QUBITOR_NETWORK_PROFILE:-devnet}}"
DATA_DIR="${QUBITOR_DATA_DIR:-$ROOT_DIR/data/$NETWORK}"
DEPLOYMENTS_DIR="${QUBITOR_DEPLOYMENTS_DIR:-$ROOT_DIR/contracts/deployments/$NETWORK}"

bash "$ROOT_DIR/scripts/devnet/stop.sh"
rm -rf "$DATA_DIR"
echo "[qubitor-$NETWORK] removed $DATA_DIR"
rm -rf "$DEPLOYMENTS_DIR"
echo "[qubitor-$NETWORK] removed $DEPLOYMENTS_DIR"
