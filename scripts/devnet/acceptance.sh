#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA_DIR="${QUBITOR_DATA_DIR:-$ROOT_DIR/data/devnet}"
LOG_DIR="${QUBITOR_ACCEPTANCE_LOG_DIR:-$ROOT_DIR/logs/devnet-acceptance}"
PID_FILE="$DATA_DIR/qubitor-node.pid"
TSX_BIN="${QUBITOR_TSX_BIN:-$ROOT_DIR/node_modules/.bin/tsx}"
RPC_URL="${QUBITOR_RPC_URL:-http://127.0.0.1:8545}"
RPC_GATEWAY_HEALTH_URL="${QUBITOR_RPC_GATEWAY_HEALTH_URL:-http://127.0.0.1:18545/health}"
FAUCET_STATUS_URL="${QUBITOR_FAUCET_STATUS_URL:-http://127.0.0.1:18546/faucet/status}"
PQ_RELAYER_STATUS_URL="${QUBITOR_PQ_RELAYER_STATUS_URL:-http://127.0.0.1:18548/pq-dev/status}"
INDEXER_HEALTH_URL="${QUBITOR_INDEXER_HEALTH_URL:-http://127.0.0.1:18549/health}"
EXPLORER_HEALTH_URL="${QUBITOR_EXPLORER_HEALTH_URL:-http://127.0.0.1:18547/health}"
EXPECTED_CHAIN_ID_HEX="0x164c9"

STARTED_DEVNET=0
SERVICE_PIDS=()
SERVICE_NAMES=()

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "[qubitor-acceptance] $name is required" >&2
    exit 1
  fi
}

devnet_running() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1
}

rpc_chain_id() {
  curl -fsS "$RPC_URL" \
    -H "content-type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' 2>/dev/null
}

wait_for_rpc() {
  local response=""
  for _ in $(seq 1 60); do
    response="$(rpc_chain_id || true)"
    if [[ "$response" == *"\"result\":\"$EXPECTED_CHAIN_ID_HEX\""* ]]; then
      echo "[qubitor-acceptance] devnet RPC ready at $RPC_URL"
      return 0
    fi
    sleep 1
  done

  echo "[qubitor-acceptance] devnet RPC did not become ready at $RPC_URL" >&2
  echo "[qubitor-acceptance] last response: ${response:-<none>}" >&2
  tail -n 80 "$ROOT_DIR/logs/qubitor-node.log" >&2 || true
  exit 1
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local log_file="$3"

  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[qubitor-acceptance] $name ready at $url"
      return 0
    fi
    sleep 1
  done

  echo "[qubitor-acceptance] $name did not become ready at $url" >&2
  tail -n 80 "$log_file" >&2 || true
  exit 1
}

start_service() {
  local name="$1"
  local health_url="$2"
  local log_file="$3"
  shift 3

  if curl -fsS "$health_url" >/dev/null 2>&1; then
    echo "[qubitor-acceptance] using existing $name at $health_url"
    return 0
  fi

  echo "[qubitor-acceptance] starting $name"
  if command -v setsid >/dev/null 2>&1; then
    setsid "$@" > "$log_file" 2>&1 &
  else
    "$@" > "$log_file" 2>&1 &
  fi

  local pid="$!"
  SERVICE_PIDS+=("$pid")
  SERVICE_NAMES+=("$name")

  sleep 1
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    echo "[qubitor-acceptance] $name exited during startup" >&2
    tail -n 80 "$log_file" >&2 || true
    exit 1
  fi

  wait_for_http "$name" "$health_url" "$log_file"
}

stop_services() {
  local index
  for ((index = ${#SERVICE_PIDS[@]} - 1; index >= 0; index--)); do
    local pid="${SERVICE_PIDS[$index]}"
    local name="${SERVICE_NAMES[$index]}"

    if kill -0 "$pid" >/dev/null 2>&1; then
      echo "[qubitor-acceptance] stopping $name"
      kill -TERM "-$pid" >/dev/null 2>&1 || kill -TERM "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
}

cleanup() {
  local status="$?"
  stop_services

  if [[ "$STARTED_DEVNET" == "1" ]]; then
    (cd "$ROOT_DIR" && pnpm devnet:stop) || true
  fi

  exit "$status"
}

run_step() {
  local label="$1"
  shift
  echo "[qubitor-acceptance] $label"
  (cd "$ROOT_DIR" && "$@")
}

require_command curl
require_command pnpm

if [[ ! -x "$TSX_BIN" ]]; then
  echo "[qubitor-acceptance] missing tsx runner at $TSX_BIN. Run: pnpm install" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if devnet_running; then
  echo "[qubitor-acceptance] using existing devnet pid $(cat "$PID_FILE")"
else
  STARTED_DEVNET=1
fi

run_step "starting devnet" pnpm devnet:start
wait_for_rpc

run_step "deploying contracts" pnpm contracts:deploy:devnet

start_service "rpc gateway" "$RPC_GATEWAY_HEALTH_URL" "$LOG_DIR/rpc-gateway.log" \
  "$TSX_BIN" "$ROOT_DIR/services/rpc-gateway/src/index.ts"
start_service "faucet" "$FAUCET_STATUS_URL" "$LOG_DIR/faucet-api.log" \
  "$TSX_BIN" "$ROOT_DIR/services/faucet-api/src/index.ts"
start_service "PQ relayer" "$PQ_RELAYER_STATUS_URL" "$LOG_DIR/pq-relayer-api.log" \
  "$TSX_BIN" "$ROOT_DIR/services/pq-relayer-api/src/index.ts"
start_service "indexer" "$INDEXER_HEALTH_URL" "$LOG_DIR/indexer.log" \
  "$TSX_BIN" "$ROOT_DIR/services/indexer/src/index.ts"
start_service "explorer-lite" "$EXPLORER_HEALTH_URL" "$LOG_DIR/explorer-lite.log" \
  "$TSX_BIN" "$ROOT_DIR/apps/explorer-lite/src/index.ts"

run_step "running docs claim acceptance" pnpm docs:acceptance
run_step "running admin-control acceptance" pnpm admin:acceptance
run_step "running node-owned PQ account smoke" pnpm devnet:pq-smoke
run_step "running PQ-controlled admin smoke" pnpm devnet:pq-admin-smoke
run_step "running explorer proof smoke" pnpm devnet:explorer-smoke
run_step "running wallet-owned PQ account smoke" pnpm devnet:wallet-pq-smoke
run_step "running wallet PQ key-rotation smoke" pnpm devnet:wallet-pq-rotate-smoke
run_step "running encrypted-backup restore smoke" pnpm devnet:wallet-pq-backup-smoke
run_step "running mobile wallet app acceptance" pnpm devnet:wallet-app-acceptance
run_step "running mobile wallet UI smoke" pnpm devnet:wallet-app-ui-smoke
run_step "writing verified proof pack" pnpm devnet:proof-pack

echo "[qubitor-acceptance] ok"
