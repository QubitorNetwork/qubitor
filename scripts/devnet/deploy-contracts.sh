#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NETWORK="${QUBITOR_NETWORK:-${QUBITOR_NETWORK_PROFILE:-devnet}}"
RPC_URL="${QUBITOR_RPC_URL:-http://127.0.0.1:8545}"
GENESIS="${QUBITOR_GENESIS_FILE:-$ROOT_DIR/clients/qubitor-node/config/$NETWORK/genesis.json}"
DEPLOYMENTS_DIR="${QUBITOR_DEPLOYMENTS_DIR:-$ROOT_DIR/contracts/deployments/$NETWORK}"

case "$NETWORK" in
  devnet) ;;
  testnet) ;;
  mainnet) ;;
  *)
    echo "[qubitor-contracts] unsupported QUBITOR_NETWORK=$NETWORK. Use devnet, testnet, or mainnet." >&2
    exit 1
    ;;
esac

if [[ -n "${QUBITOR_DEPLOYER_PRIVATE_KEY:-}" ]]; then
  echo "[qubitor-contracts] QUBITOR_DEPLOYER_PRIVATE_KEY is ignored and prohibited for Qubitor-native launch" >&2
fi

echo "[qubitor-contracts] building contracts"
forge build --root "$ROOT_DIR/contracts" >/dev/null

echo "[qubitor-contracts] installing canonical system contracts into genesis"
node "$ROOT_DIR/scripts/devnet/install-system-contracts.mjs" \
  --network "$NETWORK" \
  --genesis "$GENESIS" \
  --deployments-dir "$DEPLOYMENTS_DIR"

rpc_call() {
  local method="$1"
  local params="$2"
  curl -fsS "$RPC_URL" \
    -H "content-type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}" 2>/dev/null || true
}

read_json_field() {
  local field="$1"
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(data[process.argv[2]] || '')" \
    "$DEPLOYMENTS_DIR/deployments.json" "$field"
}

verify_live_code() {
  local label="$1"
  local address="$2"
  local response code
  response="$(rpc_call eth_getCode "[\"$address\",\"latest\"]")"
  [[ -n "$response" ]] || return 0
  code="$(node -e "const payload=JSON.parse(process.argv[1]); console.log(payload.result || '')" "$response" 2>/dev/null || true)"
  if [[ "$code" == "0x" || -z "$code" ]]; then
    echo "[qubitor-contracts] $label is not present on the running chain at $address" >&2
    echo "[qubitor-contracts] reset/re-init the chain so the updated genesis takes effect: pnpm devnet:reset && pnpm devnet:start" >&2
    exit 1
  fi
  echo "[qubitor-contracts] verified $label at $address"
}

SECURITY_ADDRESS="$(read_json_field securityModeRegistry)"
READINESS_ADDRESS="$(read_json_field accountReadinessRegistry)"
FACTORY_ADDRESS="$(read_json_field qubitorAccountFactory)"

verify_live_code "SecurityModeRegistry" "$SECURITY_ADDRESS"
verify_live_code "AccountReadinessRegistry" "$READINESS_ADDRESS"
verify_live_code "QubitorAccountFactory" "$FACTORY_ADDRESS"

echo "[qubitor-contracts] genesis/system deployment ready: $DEPLOYMENTS_DIR/deployments.json"
