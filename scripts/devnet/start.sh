#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NETWORK="${QUBITOR_NETWORK:-${QUBITOR_NETWORK_PROFILE:-devnet}}"
DATA_DIR="${QUBITOR_DATA_DIR:-$ROOT_DIR/data/$NETWORK}"
LOG_DIR="$ROOT_DIR/logs"
GENESIS="${QUBITOR_GENESIS_FILE:-$ROOT_DIR/clients/qubitor-node/config/$NETWORK/genesis.json}"
PID_FILE="$DATA_DIR/qubitor-node.pid"
LOCAL_BIN="$ROOT_DIR/build/bin/qubitor-geth"
BIN="${QUBITOR_COREGETH_BIN:-}"

case "$NETWORK" in
  devnet) CHAIN_ID="${QUBITOR_NETWORK_ID:-91337}" ;;
  testnet) CHAIN_ID="${QUBITOR_NETWORK_ID:-91338}" ;;
  mainnet) CHAIN_ID="${QUBITOR_NETWORK_ID:-91339}" ;;
  *)
    echo "[qubitor-node] unsupported QUBITOR_NETWORK=$NETWORK. Use devnet, testnet, or mainnet." >&2
    exit 1
    ;;
esac

if [[ -z "$BIN" ]]; then
  if [[ -x "$LOCAL_BIN" ]]; then
    BIN="$LOCAL_BIN"
  elif command -v core-geth >/dev/null 2>&1; then
    BIN="core-geth"
  elif [[ "${QUBITOR_ALLOW_STOCK_GETH_FALLBACK:-0}" == "1" ]] && command -v geth >/dev/null 2>&1; then
    BIN="geth"
    echo "[qubitor-$NETWORK] warning: using stock geth fallback. Modern geth may refuse Ethash sealing, and the Qubitor ML-DSA precompile will not be available."
  else
    echo "[qubitor-$NETWORK] no CoreGeth-compatible binary found. Set QUBITOR_COREGETH_BIN=/path/to/core-geth." >&2
    echo "[qubitor-$NETWORK] or build the local Qubitor fork with: pnpm coregeth:build" >&2
    echo "[qubitor-$NETWORK] stock geth fallback is disabled because modern geth does not seal Ethash private networks." >&2
    exit 1
  fi
fi

mkdir -p "$DATA_DIR" "$LOG_DIR"

if [[ ! -f "$GENESIS" ]]; then
  echo "[qubitor-$NETWORK] missing genesis file: $GENESIS" >&2
  exit 1
fi

if [[ "${QUBITOR_SYSTEM_CONTRACTS_INSTALL:-1}" == "1" ]]; then
  echo "[qubitor-$NETWORK] refreshing genesis system contracts"
  forge build --root "$ROOT_DIR/contracts" >/dev/null
  node "$ROOT_DIR/scripts/devnet/install-system-contracts.mjs" \
    --network "$NETWORK" \
    --genesis "$GENESIS" \
    --deployments-dir "${QUBITOR_DEPLOYMENTS_DIR:-$ROOT_DIR/contracts/deployments/$NETWORK}" >/dev/null
fi

DEFAULT_MINER_ETHERBASE="$(
  node -e "const fs=require('fs'); const p=process.argv[1]; try { const d=JSON.parse(fs.readFileSync(p, 'utf8')); console.log(d.devnetPQAccount || '0x0000000000000000000000000000000000000000'); } catch { console.log('0x0000000000000000000000000000000000000000'); }" \
    "${QUBITOR_DEPLOYMENTS_DIR:-$ROOT_DIR/contracts/deployments/$NETWORK}/deployments.json"
)"

if [[ ! -d "$DATA_DIR/geth/chaindata" ]]; then
  "$BIN" init --datadir "$DATA_DIR" "$GENESIS"
fi

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
  echo "[qubitor-$NETWORK] already running with pid $(cat "$PID_FILE")"
  exit 0
fi

echo "[qubitor-$NETWORK] starting node with $BIN"
NODE_ARGS=(
  --datadir "$DATA_DIR"
  --networkid "$CHAIN_ID"
  --http
  --http.addr "${QUBITOR_HTTP_ADDR:-127.0.0.1}"
  --http.port "${QUBITOR_NODE_RPC_PORT:-8545}"
  --http.api eth,net,web3,qubitor,txpool,miner,admin,debug
  --http.corsdomain "*"
  --http.vhosts "*"
  --ws
  --ws.addr "${QUBITOR_WS_ADDR:-127.0.0.1}"
  --ws.port "${QUBITOR_NODE_WS_PORT:-8546}"
  --ws.api eth,net,web3
  --mine
  --miner.threads "${QUBITOR_MINER_THREADS:-1}"
  --miner.etherbase "${QUBITOR_MINER_ETHERBASE:-$DEFAULT_MINER_ETHERBASE}"
  --miner.gaslimit "${QUBITOR_MINER_GASLIMIT:-30000000}"
  --verbosity "${QUBITOR_GETH_VERBOSITY:-3}"
)

if [[ -n "${QUBITOR_NODEKEY_FILE:-}" ]]; then
  NODE_ARGS+=(--nodekey "$QUBITOR_NODEKEY_FILE")
fi

if [[ -n "${QUBITOR_BOOTNODES:-}" ]]; then
  NODE_ARGS+=(--bootnodes "$QUBITOR_BOOTNODES")
elif [[ "${QUBITOR_DISCOVERY:-0}" != "1" ]]; then
  NODE_ARGS+=(--nodiscover)
fi

if command -v setsid >/dev/null 2>&1; then
  setsid "$BIN" "${NODE_ARGS[@]}" < /dev/null > "$LOG_DIR/qubitor-node.log" 2>&1 &
else
  nohup "$BIN" "${NODE_ARGS[@]}" < /dev/null > "$LOG_DIR/qubitor-node.log" 2>&1 &
fi

echo "$!" > "$PID_FILE"
disown "$(cat "$PID_FILE")" >/dev/null 2>&1 || true

sleep 1
if ! kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
  echo "[qubitor-$NETWORK] node exited during startup. Last log lines:" >&2
  tail -n 80 "$LOG_DIR/qubitor-node.log" >&2 || true
  exit 1
fi

echo "[qubitor-$NETWORK] pid $(cat "$PID_FILE"), rpc http://${QUBITOR_HTTP_ADDR:-127.0.0.1}:${QUBITOR_NODE_RPC_PORT:-8545}"
echo "[qubitor-$NETWORK] logs $LOG_DIR/qubitor-node.log"
