#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA_ROOT="${QUBITOR_MULTINODE_DATA_DIR:-$ROOT_DIR/data/devnet-multinode}"
GENESIS="${QUBITOR_GENESIS_FILE:-$ROOT_DIR/clients/qubitor-node/config/devnet/genesis.json}"
LOG_DIR="$ROOT_DIR/logs"
LOCAL_BIN="$ROOT_DIR/build/bin/qubitor-geth"
BIN="${QUBITOR_COREGETH_BIN:-}"
NETWORK_ID="${QUBITOR_NETWORK_ID:-91337}"
NODE0_RPC_PORT="${QUBITOR_MULTINODE_NODE0_RPC_PORT:-19545}"
NODE1_RPC_PORT="${QUBITOR_MULTINODE_NODE1_RPC_PORT:-19546}"
NODE0_WS_PORT="${QUBITOR_MULTINODE_NODE0_WS_PORT:-19555}"
NODE1_WS_PORT="${QUBITOR_MULTINODE_NODE1_WS_PORT:-19556}"
NODE0_AUTHRPC_PORT="${QUBITOR_MULTINODE_NODE0_AUTHRPC_PORT:-19565}"
NODE1_AUTHRPC_PORT="${QUBITOR_MULTINODE_NODE1_AUTHRPC_PORT:-19566}"
NODE0_P2P_PORT="${QUBITOR_MULTINODE_NODE0_P2P_PORT:-30311}"
NODE1_P2P_PORT="${QUBITOR_MULTINODE_NODE1_P2P_PORT:-30312}"
NODE0_RPC="http://127.0.0.1:$NODE0_RPC_PORT"
NODE1_RPC="http://127.0.0.1:$NODE1_RPC_PORT"
MINER_ETHERBASE="$(
  node -e "const fs=require('fs'); const p=process.argv[1]; try { const d=JSON.parse(fs.readFileSync(p, 'utf8')); console.log(d.devnetPQAccount || '0x0000000000000000000000000000000000000000'); } catch { console.log('0x0000000000000000000000000000000000000000'); }" \
    "$ROOT_DIR/contracts/deployments/devnet/deployments.json"
)"
MINER_ETHERBASE="${QUBITOR_MINER_ETHERBASE:-$MINER_ETHERBASE}"

NODE0_PID=""
NODE1_PID=""

fail() {
  echo "[qubitor-multinode] $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

cleanup() {
  for pid in "$NODE1_PID" "$NODE0_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
}
trap cleanup EXIT

rpc() {
  local url="$1"
  local method="$2"
  local params="$3"
  curl -fsS "$url" \
    -H "content-type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}"
}

json_result() {
  node -e 'let input = ""; process.stdin.on("data", (d) => input += d); process.stdin.on("end", () => { const payload = JSON.parse(input); if (payload.error) { console.error(payload.error.message || JSON.stringify(payload.error)); process.exit(2); } console.log(typeof payload.result === "string" ? payload.result : JSON.stringify(payload.result)); });'
}

normalize_enode() {
  node -e '
    let input = "";
    process.stdin.on("data", (d) => input += d);
    process.stdin.on("end", () => {
      const payload = JSON.parse(input);
      if (payload.error) {
        console.error(payload.error.message || JSON.stringify(payload.error));
        process.exit(2);
      }
      const enode = payload.result.enode;
      const match = enode.match(/^(enode:\/\/[^@]+@)(.*)$/);
      if (!match) process.exit(1);
      const rest = match[2].replace(/^\[[^\]]+\]|^[^:]+/, "127.0.0.1");
      console.log(match[1] + rest);
    });
  '
}

get_enode() {
  local url="$1"
  rpc "$url" admin_nodeInfo "[]" | normalize_enode
}

hex_to_decimal() {
  node -e 'console.log(BigInt(process.argv[1]).toString())' "$1"
}

wait_rpc() {
  local url="$1"
  local label="$2"
  for _ in $(seq 1 60); do
    if rpc "$url" eth_chainId "[]" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  fail "$label RPC did not become ready"
}

wait_peer() {
  local url="$1"
  local label="$2"
  for _ in $(seq 1 90); do
    local peers
    peers="$(hex_to_decimal "$(rpc "$url" net_peerCount "[]" | json_result)")"
    if (( peers > 0 )); then
      echo "[qubitor-multinode] $label peers=$peers"
      return 0
    fi
    sleep 1
  done
  fail "$label did not connect to a peer"
}

wait_synced_block() {
  local min_block="$1"
  for _ in $(seq 1 90); do
    local block
    block="$(hex_to_decimal "$(rpc "$NODE1_RPC" eth_blockNumber "[]" | json_result)")"
    if (( block >= min_block )); then
      echo "[qubitor-multinode] node1 block=$block"
      return 0
    fi
    sleep 1
  done
  fail "node1 did not sync to block $min_block"
}

if [[ -z "$BIN" ]]; then
  if [[ -x "$LOCAL_BIN" ]]; then
    BIN="$LOCAL_BIN"
  elif command -v core-geth >/dev/null 2>&1; then
    BIN="core-geth"
  else
    fail "no CoreGeth-compatible binary found. Run pnpm coregeth:build or set QUBITOR_COREGETH_BIN."
  fi
fi

require_command curl
require_command node
require_command pnpm
[[ -f "$GENESIS" ]] || fail "missing genesis file: $GENESIS"

rm -rf "$DATA_ROOT"
mkdir -p "$DATA_ROOT/node0" "$DATA_ROOT/node1" "$LOG_DIR"
"$BIN" init --datadir "$DATA_ROOT/node0" "$GENESIS" >/dev/null
"$BIN" init --datadir "$DATA_ROOT/node1" "$GENESIS" >/dev/null

echo "[qubitor-multinode] starting node0 miner on $NODE0_RPC"
QUBITOR_EOA_TXS="${QUBITOR_EOA_TXS:-0}" "$BIN" \
  --datadir "$DATA_ROOT/node0" \
  --networkid "$NETWORK_ID" \
  --syncmode full \
  --http \
  --http.addr 127.0.0.1 \
  --http.port "$NODE0_RPC_PORT" \
  --http.api eth,net,web3,admin,qubitor,txpool \
  --http.corsdomain "*" \
  --http.vhosts "*" \
  --ws \
  --ws.addr 127.0.0.1 \
  --ws.port "$NODE0_WS_PORT" \
  --ws.api eth,net,web3 \
  --authrpc.addr 127.0.0.1 \
  --authrpc.port "$NODE0_AUTHRPC_PORT" \
  --port "$NODE0_P2P_PORT" \
  --nodiscover \
  --mine \
  --miner.threads 1 \
  --miner.etherbase "$MINER_ETHERBASE" \
  --miner.gaslimit 30000000 \
  --verbosity "${QUBITOR_GETH_VERBOSITY:-3}" \
  > "$LOG_DIR/qubitor-multinode-node0.log" 2>&1 &
NODE0_PID="$!"
wait_rpc "$NODE0_RPC" node0

NODE0_ENODE="$(get_enode "$NODE0_RPC")"
echo "[qubitor-multinode] node0 enode $NODE0_ENODE"

echo "[qubitor-multinode] starting node1 on $NODE1_RPC"
QUBITOR_EOA_TXS="${QUBITOR_EOA_TXS:-0}" "$BIN" \
  --datadir "$DATA_ROOT/node1" \
  --networkid "$NETWORK_ID" \
  --syncmode full \
  --http \
  --http.addr 127.0.0.1 \
  --http.port "$NODE1_RPC_PORT" \
  --http.api eth,net,web3,admin,qubitor,txpool \
  --http.corsdomain "*" \
  --http.vhosts "*" \
  --ws \
  --ws.addr 127.0.0.1 \
  --ws.port "$NODE1_WS_PORT" \
  --ws.api eth,net,web3 \
  --authrpc.addr 127.0.0.1 \
  --authrpc.port "$NODE1_AUTHRPC_PORT" \
  --port "$NODE1_P2P_PORT" \
  --nodiscover \
  --verbosity "${QUBITOR_GETH_VERBOSITY:-3}" \
  > "$LOG_DIR/qubitor-multinode-node1.log" 2>&1 &
NODE1_PID="$!"
wait_rpc "$NODE1_RPC" node1
NODE1_ENODE="$(get_enode "$NODE1_RPC")"
echo "[qubitor-multinode] node1 enode $NODE1_ENODE"
rpc "$NODE1_RPC" admin_addPeer "[\"$NODE0_ENODE\"]" >/dev/null || true
rpc "$NODE0_RPC" admin_addPeer "[\"$NODE1_ENODE\"]" >/dev/null || true

wait_peer "$NODE0_RPC" node0
wait_peer "$NODE1_RPC" node1

NODE0_BLOCK="$(hex_to_decimal "$(rpc "$NODE0_RPC" eth_blockNumber "[]" | json_result)")"
if (( NODE0_BLOCK < 1 )); then
  for _ in $(seq 1 30); do
    sleep 1
    NODE0_BLOCK="$(hex_to_decimal "$(rpc "$NODE0_RPC" eth_blockNumber "[]" | json_result)")"
    (( NODE0_BLOCK >= 1 )) && break
  done
fi
(( NODE0_BLOCK >= 1 )) || fail "node0 did not mine a block"
wait_synced_block "$NODE0_BLOCK"

rpc "$NODE1_RPC" admin_addPeer "[\"$NODE0_ENODE\"]" >/dev/null || true
rpc "$NODE0_RPC" admin_addPeer "[\"$NODE1_ENODE\"]" >/dev/null || true
wait_peer "$NODE0_RPC" node0
wait_peer "$NODE1_RPC" node1

QUBITOR_RPC_URL="$NODE1_RPC" \
QUBITOR_PQ_NATIVE_RAW_TARGET="0x0000000000000000000000000000000000006060" \
QUBITOR_PQ_NATIVE_RAW_VALUE_WEI="${QUBITOR_MULTINODE_VALUE_WEI:-6060}" \
  bash "$ROOT_DIR/scripts/devnet/pq-native-raw-tx-smoke.sh"

echo "[qubitor-multinode] ok"
