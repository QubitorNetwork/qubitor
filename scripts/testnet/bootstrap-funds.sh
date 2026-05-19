#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${QUBITOR_TESTNET_ENV_FILE:-}"
RPC_URL="${QUBITOR_RPC_URL:-http://127.0.0.1:8545}"
NETWORK="${QUBITOR_NETWORK:-${QUBITOR_NETWORK_PROFILE:-testnet}}"
MINER_MIN_WEI="${QUBITOR_BOOTSTRAP_MINER_MIN_WEI:-1}"
FAUCET_MIN_WEI="${QUBITOR_BOOTSTRAP_FAUCET_MIN_WEI:-$MINER_MIN_WEI}"
WAIT_SECONDS="${QUBITOR_BOOTSTRAP_WAIT_SECONDS:-180}"

fail() {
  echo "[qubitor-testnet-bootstrap] $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

require_address() {
  local name="$1"
  local value="${!name:-}"
  [[ "$value" =~ ^0x[0-9a-fA-F]{40}$ ]] || fail "$name must be a 20-byte hex address"
}

reject_private_key() {
  local name="$1"
  if [[ -n "${!name:-}" ]]; then
    fail "$name is prohibited for Qubitor-native testnet bootstrap"
  fi
}

if [[ -z "$ENV_FILE" && -f "$ROOT_DIR/.env.testnet.local" ]] && grep -Eq '^QUBITOR_NETWORK=testnet$' "$ROOT_DIR/.env.testnet.local"; then
  ENV_FILE="$ROOT_DIR/.env.testnet.local"
fi
if [[ -z "$ENV_FILE" && -f "$ROOT_DIR/.env.testnet" ]] && grep -Eq '^QUBITOR_NETWORK=testnet$' "$ROOT_DIR/.env.testnet"; then
  ENV_FILE="$ROOT_DIR/.env.testnet"
fi
if [[ -n "$ENV_FILE" ]]; then
  [[ -f "$ENV_FILE" ]] || fail "missing env file: $ENV_FILE"
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
  RPC_URL="${QUBITOR_RPC_URL:-$RPC_URL}"
  NETWORK="${QUBITOR_NETWORK:-$NETWORK}"
  MINER_MIN_WEI="${QUBITOR_BOOTSTRAP_MINER_MIN_WEI:-$MINER_MIN_WEI}"
  FAUCET_MIN_WEI="${QUBITOR_BOOTSTRAP_FAUCET_MIN_WEI:-$FAUCET_MIN_WEI}"
fi

[[ "$NETWORK" == "testnet" ]] || fail "QUBITOR_NETWORK must be testnet"
[[ "${QUBITOR_EOA_TXS:-}" == "0" ]] || fail "QUBITOR_EOA_TXS=0 is required for Qubitor-native testnet bootstrap"
require_command cast
require_command node
require_address QUBITOR_MINER_ETHERBASE
require_address QUBITOR_FAUCET_TREASURY_VAULT
reject_private_key QUBITOR_MINER_PRIVATE_KEY
reject_private_key QUBITOR_DEPLOYER_PRIVATE_KEY
reject_private_key QUBITOR_FAUCET_PRIVATE_KEY
reject_private_key QUBITOR_PQ_RELAYER_PRIVATE_KEY

[[ "$MINER_MIN_WEI" =~ ^[0-9]+$ ]] || fail "QUBITOR_BOOTSTRAP_MINER_MIN_WEI must be integer wei"
[[ "$FAUCET_MIN_WEI" =~ ^[0-9]+$ ]] || fail "QUBITOR_BOOTSTRAP_FAUCET_MIN_WEI must be integer wei"

bigint_ge() {
  node -e 'process.exit(BigInt(process.argv[1]) >= BigInt(process.argv[2]) ? 0 : 1)' "$1" "$2"
}

deadline=$((SECONDS + WAIT_SECONDS))
miner_balance=0
faucet_balance=0

echo "[qubitor-testnet-bootstrap] waiting for PQ miner/faucet treasury balance on $RPC_URL"
while (( SECONDS <= deadline )); do
  miner_balance="$(cast balance "$QUBITOR_MINER_ETHERBASE" --rpc-url "$RPC_URL" 2>/dev/null || echo 0)"
  faucet_balance="$(cast balance "$QUBITOR_FAUCET_TREASURY_VAULT" --rpc-url "$RPC_URL" 2>/dev/null || echo 0)"
  if [[ "$miner_balance" =~ ^[0-9]+$ && "$faucet_balance" =~ ^[0-9]+$ ]] &&
    bigint_ge "$miner_balance" "$MINER_MIN_WEI" &&
    bigint_ge "$faucet_balance" "$FAUCET_MIN_WEI"; then
    echo "[qubitor-testnet-bootstrap] miner PQ wallet funded by PoW rewards: $miner_balance wei"
    echo "[qubitor-testnet-bootstrap] faucet PQ treasury funded: $faucet_balance wei"
    echo "[qubitor-testnet-bootstrap] no EOA bootstrap transfers are performed"
    echo "[qubitor-testnet-bootstrap] ok"
    exit 0
  fi
  sleep 3
done

fail "miner balance is $miner_balance wei and faucet treasury balance is $faucet_balance wei; need miner >= $MINER_MIN_WEI and faucet >= $FAUCET_MIN_WEI. Mine directly to the PQ faucet treasury or fund it with a native PQ transaction; no EOA bootstrap transfer is performed."
