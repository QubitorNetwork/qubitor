#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RPC_URL="${QUBITOR_RPC_URL:-http://127.0.0.1:8545}"
NETWORK="${QUBITOR_NETWORK:-devnet}"
ITERATIONS="${QUBITOR_SOAK_ITERATIONS:-12}"
VALUE_WEI="${QUBITOR_SOAK_VALUE_WEI:-12345}"
SLEEP_SECONDS="${QUBITOR_SOAK_SLEEP_SECONDS:-0}"

fail() {
  echo "[qubitor-soak] $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

rpc() {
  local method="$1"
  local params="$2"
  curl -fsS "$RPC_URL" \
    -H "content-type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}"
}

json_result() {
  node -e 'let input = ""; process.stdin.on("data", (d) => input += d); process.stdin.on("end", () => { const payload = JSON.parse(input); if (payload.error) { console.error(payload.error.message || JSON.stringify(payload.error)); process.exit(2); } console.log(typeof payload.result === "string" ? payload.result : JSON.stringify(payload.result)); });'
}

hex_to_decimal() {
  node -e 'console.log(BigInt(process.argv[1]).toString())' "$1"
}

require_command curl
require_command node
require_command pnpm

[[ "$ITERATIONS" =~ ^[0-9]+$ ]] || fail "QUBITOR_SOAK_ITERATIONS must be a positive integer"
(( ITERATIONS > 0 )) || fail "QUBITOR_SOAK_ITERATIONS must be positive"

CHAIN_ID="$(rpc eth_chainId "[]" | json_result)"
EXPECTED_CHAIN_ID_HEX="${QUBITOR_EXPECTED_CHAIN_ID_HEX:-}"
if [[ -z "$EXPECTED_CHAIN_ID_HEX" ]]; then
  case "$NETWORK" in
    devnet) EXPECTED_CHAIN_ID_HEX="0x164c9" ;;
    testnet) EXPECTED_CHAIN_ID_HEX="0x164ca" ;;
    *) EXPECTED_CHAIN_ID_HEX="$CHAIN_ID" ;;
  esac
fi
[[ "$CHAIN_ID" == "$EXPECTED_CHAIN_ID_HEX" ]] || fail "expected Qubitor $NETWORK chain ID $EXPECTED_CHAIN_ID_HEX, got $CHAIN_ID"

START_BLOCK="$(hex_to_decimal "$(rpc eth_blockNumber "[]" | json_result)")"
echo "[qubitor-soak] starting at block $START_BLOCK on $RPC_URL"

for i in $(seq 1 "$ITERATIONS"); do
  TARGET="$(printf '0x%040x' "$((0x5000 + i))")"
  echo "[qubitor-soak] iteration $i/$ITERATIONS target=$TARGET"
  QUBITOR_RPC_URL="$RPC_URL" \
  QUBITOR_PQ_NATIVE_RAW_TARGET="$TARGET" \
  QUBITOR_PQ_NATIVE_RAW_VALUE_WEI="$VALUE_WEI" \
  QUBITOR_PQ_NATIVE_RAW_SEED="${QUBITOR_PQ_NATIVE_RAW_SEED:-${QUBITOR_FAUCET_PQ_SEED:-}}" \
    bash "$ROOT_DIR/scripts/devnet/pq-native-raw-tx-smoke.sh"
  if (( SLEEP_SECONDS > 0 )); then
    sleep "$SLEEP_SECONDS"
  fi
done

END_BLOCK="$(hex_to_decimal "$(rpc eth_blockNumber "[]" | json_result)")"
if (( END_BLOCK <= START_BLOCK )); then
  fail "block number did not advance: start=$START_BLOCK end=$END_BLOCK"
fi

echo "[qubitor-soak] block delta $((END_BLOCK - START_BLOCK))"
echo "[qubitor-soak] ok"
