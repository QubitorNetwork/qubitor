#!/usr/bin/env bash
set -euo pipefail

NETWORK="${QUBITOR_NETWORK:-${QUBITOR_NETWORK_PROFILE:-devnet}}"
RPC_URL="${QUBITOR_RPC_URL:-http://127.0.0.1:8545}"

case "$NETWORK" in
  devnet) EXPECTED_CHAIN_ID="${QUBITOR_NETWORK_ID:-91337}" ;;
  testnet) EXPECTED_CHAIN_ID="${QUBITOR_NETWORK_ID:-91338}" ;;
  mainnet) EXPECTED_CHAIN_ID="${QUBITOR_NETWORK_ID:-91339}" ;;
  *)
    echo "[qubitor-health] unsupported QUBITOR_NETWORK=$NETWORK. Use devnet, testnet, or mainnet." >&2
    exit 1
    ;;
esac
EXPECTED_CHAIN_ID_HEX="$(printf '0x%x' "$EXPECTED_CHAIN_ID")"

if ! command -v curl >/dev/null 2>&1; then
  echo "[qubitor-$NETWORK] curl is required for health checks" >&2
  exit 1
fi

CHAIN_ID_RESPONSE="$(curl -sS -X POST "$RPC_URL" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' || true)"
BLOCK_NUMBER="$(curl -sS -X POST "$RPC_URL" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":2,"method":"eth_blockNumber","params":[]}' || true)"

echo "[qubitor-$NETWORK] rpc: $RPC_URL"
echo "[qubitor-$NETWORK] eth_chainId: $CHAIN_ID_RESPONSE"
echo "[qubitor-$NETWORK] eth_blockNumber: $BLOCK_NUMBER"

if [[ "$CHAIN_ID_RESPONSE" != *"$EXPECTED_CHAIN_ID_HEX"* ]]; then
  echo "[qubitor-$NETWORK] expected chain ID $EXPECTED_CHAIN_ID_HEX ($EXPECTED_CHAIN_ID)" >&2
  exit 1
fi
