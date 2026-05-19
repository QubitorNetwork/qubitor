#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WALLET_DIR="${QUBITOR_WALLET_DIR:-$ROOT_DIR/../Qubitor}"

if [[ ! -d "$WALLET_DIR" ]]; then
  echo "[qubitor-wallet-pq-smoke] missing wallet repo: $WALLET_DIR" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[qubitor-wallet-pq-smoke] pnpm is required" >&2
  exit 1
fi

(
  cd "$WALLET_DIR"
  EXPO_PUBLIC_QUBITOR_CHAIN_ID="${EXPO_PUBLIC_QUBITOR_CHAIN_ID:-91337}" \
  EXPO_PUBLIC_QUBITOR_RPC_URL="${EXPO_PUBLIC_QUBITOR_RPC_URL:-${QUBITOR_RPC_URL:-http://127.0.0.1:8545}}" \
  EXPO_PUBLIC_QUBITOR_FAUCET_URL="${EXPO_PUBLIC_QUBITOR_FAUCET_URL:-${QUBITOR_FAUCET_URL:-http://127.0.0.1:18546}}" \
  EXPO_PUBLIC_QUBITOR_PQ_RELAYER_URL="${EXPO_PUBLIC_QUBITOR_PQ_RELAYER_URL:-${QUBITOR_PQ_RELAYER_URL:-http://127.0.0.1:18548}}" \
  QUBITOR_MOBILE_ACCEPTANCE_TARGET="${QUBITOR_WALLET_PQ_SMOKE_TARGET:-0x000000000000000000000000000000000000dEaD}" \
  QUBITOR_MOBILE_ACCEPTANCE_VALUE_WEI="${QUBITOR_WALLET_PQ_SMOKE_VALUE_WEI:-98765}" \
  pnpm mobile:devnet-acceptance
)

echo "[qubitor-wallet-pq-smoke] ok"
