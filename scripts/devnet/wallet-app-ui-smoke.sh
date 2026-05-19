#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WALLET_DIR="${QUBITOR_WALLET_DIR:-$ROOT_DIR/../Qubitor}"
ARTIFACT_DIR="${QUBITOR_MOBILE_UI_SMOKE_ARTIFACT_DIR:-$ROOT_DIR/logs/devnet-acceptance/mobile-ui-smoke}"

if [[ ! -d "$WALLET_DIR" ]]; then
  echo "[qubitor-wallet-app-ui-smoke] missing wallet repo: $WALLET_DIR" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[qubitor-wallet-app-ui-smoke] pnpm is required" >&2
  exit 1
fi

(
  cd "$WALLET_DIR"
  EXPO_PUBLIC_QUBITOR_CHAIN_ID="${EXPO_PUBLIC_QUBITOR_CHAIN_ID:-91337}" \
  EXPO_PUBLIC_QUBITOR_RPC_URL="${EXPO_PUBLIC_QUBITOR_RPC_URL:-http://127.0.0.1:18545/rpc}" \
  EXPO_PUBLIC_QUBITOR_FAUCET_URL="${EXPO_PUBLIC_QUBITOR_FAUCET_URL:-http://127.0.0.1:18546}" \
  EXPO_PUBLIC_QUBITOR_PQ_RELAYER_URL="${EXPO_PUBLIC_QUBITOR_PQ_RELAYER_URL:-http://127.0.0.1:18548}" \
  QUBITOR_MOBILE_UI_SMOKE_ARTIFACT_DIR="$ARTIFACT_DIR" \
  pnpm mobile:devnet-ui-smoke
)
