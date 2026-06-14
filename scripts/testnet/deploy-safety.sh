#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

fail() {
  echo "[qubitor-deploy-safety] $*" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail "missing file: ${1#$ROOT_DIR/}"
}

require_contains() {
  local file="$1" pattern="$2"
  grep -Fq -- "$pattern" "$file" || fail "${file#$ROOT_DIR/} must contain: $pattern"
}

reject_contains() {
  local file="$1" pattern="$2"
  if grep -Fq -- "$pattern" "$file"; then
    fail "${file#$ROOT_DIR/} must not contain: $pattern"
  fi
}

RESET="$ROOT_DIR/scripts/testnet/reset-with-bridge-genesis.sh"
SECONDARY="$ROOT_DIR/scripts/testnet/secondary-rpc.sh"
AUX_MINER="$ROOT_DIR/scripts/testnet/aux-miner.sh"
AUX_MINER_COMPOSE="$ROOT_DIR/infra/docker-compose.aux-miner.yml"
SYNC_OPS="$ROOT_DIR/scripts/testnet/sync-ops-code.sh"
PUBLIC_COMPOSE="$ROOT_DIR/infra/docker-compose.public.yml"
PACKAGE="$ROOT_DIR/package.json"

for file in "$RESET" "$SECONDARY" "$AUX_MINER" "$AUX_MINER_COMPOSE" "$SYNC_OPS" "$PUBLIC_COMPOSE" "$PACKAGE"; do
  require_file "$file"
done

require_contains "$RESET" "QUBITOR_TESTNET_RESET_CONFIRM"
require_contains "$RESET" "RESET_QUBITOR_TESTNET_91338"
require_contains "$RESET" "backups/testnet-reset"
require_contains "$PACKAGE" "\"testnet:reset-with-bridge-genesis\""
require_contains "$PACKAGE" "\"testnet:ops-code:restart-rpc\""
require_contains "$PACKAGE" "\"testnet:ops-code:deploy-rpc-hardening\""
require_contains "$PACKAGE" "\"testnet:aux-miner:deploy\""

for file in "$SECONDARY" "$SYNC_OPS" "$PUBLIC_COMPOSE"; do
  reject_contains "$file" "rm -rf data/node/testnet"
  reject_contains "$file" "rm -rf ../data/node/testnet"
  reject_contains "$file" "geth init --datadir=/data /genesis.json"
  reject_contains "$file" "reset-with-bridge-genesis"
done

for file in "$AUX_MINER" "$AUX_MINER_COMPOSE"; do
  reject_contains "$file" "rm -rf data/node/testnet"
  reject_contains "$file" "rm -rf ../data/node/testnet"
  reject_contains "$file" "data/node/testnet:/data"
  reject_contains "$file" "reset-with-bridge-genesis"
done
require_contains "$AUX_MINER" "testnet-aux-miner-"
require_contains "$AUX_MINER" "rsync_repo_to_target"
require_contains "$AUX_MINER" "QUBITOR_AUX_MINER_ETHERBASE"
require_contains "$AUX_MINER_COMPOSE" "QUBITOR_AUX_MINER_ALLOW_INIT"
require_contains "$AUX_MINER_COMPOSE" "QUBITOR_AUX_MINER_DATA_LABEL"
require_contains "$AUX_MINER_COMPOSE" "testnet-aux-miner-*"
require_contains "$AUX_MINER_COMPOSE" "geth init --datadir=/data /genesis.json"

require_contains "$SYNC_OPS" "restart-rpc"
require_contains "$SYNC_OPS" "deploy-rpc-hardening"
require_contains "$SYNC_OPS" "rpc-gateway|public-gateway"
reject_contains "$SYNC_OPS" "qubitor-node"
require_contains "$SECONDARY" "--profile all up -d --build --remove-orphans"
require_contains "$SECONDARY" 'test -f "\$NODE_ENV"'
require_contains "$PUBLIC_COMPOSE" "public-gateway"
require_contains "$PUBLIC_COMPOSE" "reverse_proxy rpc-gateway:18545"
require_contains "$PUBLIC_COMPOSE" "reverse_proxy bridge-indexer:18701"

echo "[qubitor-deploy-safety] ok: public deploy paths do not reset testnet chain data"
