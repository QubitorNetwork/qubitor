#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NETWORK="${QUBITOR_NETWORK:-testnet}"
RPC_URL="${QUBITOR_TESTNET_LOCAL_RPC_URL:-http://127.0.0.1:8545}"
STATE_DIR="${QUBITOR_TESTNET_MONITOR_DIR:-$ROOT_DIR/data/monitor}"
STATE_FILE="$STATE_DIR/$NETWORK-height.state"
ALERT_LOG="$STATE_DIR/$NETWORK-height-alerts.log"
DROP_TOLERANCE="${QUBITOR_TESTNET_HEIGHT_DROP_TOLERANCE:-6}"
STALE_SECONDS="${QUBITOR_TESTNET_BLOCK_STALE_SECONDS:-180}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$STATE_DIR"

rpc_payload() {
  local method="$1"
  local params="${2:-[]}"
  curl -fsS -H 'content-type: application/json' --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}" "$RPC_URL"
}

rpc_result_string() {
  rpc_payload "$1" "${2:-[]}" | sed -n 's/.*"result":"\([^"]*\)".*/\1/p'
}

hex_to_dec() {
  local value="${1#0x}"
  if [[ -z "$value" ]]; then
    printf '0'
  else
    printf '%d' "$((16#$value))"
  fi
}

alert() {
  local message="$1"
  printf '%s %s\n' "$NOW" "$message" | tee -a "$ALERT_LOG" >&2
}

CURRENT_CHAIN_ID="$(rpc_result_string eth_chainId)"
HEAD_HEX="$(rpc_result_string eth_blockNumber)"
HEAD_DEC="$(hex_to_dec "$HEAD_HEX")"
CURRENT_GENESIS_HASH="$(rpc_payload eth_getBlockByNumber '["0x0",false]' | sed -n 's/.*"hash":"\([^"]*\)".*/\1/p')"
LATEST_BLOCK="$(rpc_payload eth_getBlockByNumber "[\"$HEAD_HEX\",false]")"
CURRENT_LATEST_HASH="$(printf '%s' "$LATEST_BLOCK" | sed -n 's/.*"hash":"\([^"]*\)".*/\1/p')"
LATEST_TIMESTAMP_HEX="$(printf '%s' "$LATEST_BLOCK" | sed -n 's/.*"timestamp":"\([^"]*\)".*/\1/p')"
CURRENT_LATEST_TIMESTAMP_DEC="$(hex_to_dec "$LATEST_TIMESTAMP_HEX")"
NOW_SECONDS="$(date -u +%s)"
BLOCK_AGE=$((NOW_SECONDS - CURRENT_LATEST_TIMESTAMP_DEC))

PREVIOUS_HEIGHT=""
PREVIOUS_GENESIS=""
if [[ -f "$STATE_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  PREVIOUS_HEIGHT="${HEIGHT_DEC:-}"
  PREVIOUS_GENESIS="${GENESIS_HASH:-}"
fi

if [[ -n "$PREVIOUS_GENESIS" && "$PREVIOUS_GENESIS" != "$CURRENT_GENESIS_HASH" ]]; then
  alert "GENESIS_CHANGED previous=$PREVIOUS_GENESIS current=$CURRENT_GENESIS_HASH chainId=$CURRENT_CHAIN_ID"
  exit 3
fi

if [[ -n "$PREVIOUS_HEIGHT" && "$PREVIOUS_HEIGHT" =~ ^[0-9]+$ ]]; then
  if (( HEAD_DEC + DROP_TOLERANCE < PREVIOUS_HEIGHT )); then
    alert "HEIGHT_DROPPED previous=$PREVIOUS_HEIGHT current=$HEAD_DEC tolerance=$DROP_TOLERANCE chainId=$CURRENT_CHAIN_ID"
    exit 2
  fi
fi

if (( BLOCK_AGE > STALE_SECONDS )); then
  alert "BLOCK_STALE head=$HEAD_DEC ageSeconds=$BLOCK_AGE threshold=$STALE_SECONDS chainId=$CURRENT_CHAIN_ID"
  exit 4
fi

cat > "$STATE_FILE" <<EOF
UPDATED_AT=$(printf '%q' "$NOW")
CHAIN_ID=$(printf '%q' "$CURRENT_CHAIN_ID")
HEIGHT_HEX=$(printf '%q' "$HEAD_HEX")
HEIGHT_DEC=$HEAD_DEC
GENESIS_HASH=$(printf '%q' "$CURRENT_GENESIS_HASH")
LATEST_HASH=$(printf '%q' "$CURRENT_LATEST_HASH")
LATEST_TIMESTAMP_DEC=$CURRENT_LATEST_TIMESTAMP_DEC
EOF

echo "[qubitor-height-monitor] ok chainId=$CURRENT_CHAIN_ID height=$HEAD_DEC genesis=$CURRENT_GENESIS_HASH blockAge=${BLOCK_AGE}s"
