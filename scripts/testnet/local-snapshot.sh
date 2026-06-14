#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NETWORK="${QUBITOR_NETWORK:-testnet}"
RPC_URL="${QUBITOR_TESTNET_LOCAL_RPC_URL:-http://127.0.0.1:8545}"
BACKUP_ROOT="${QUBITOR_TESTNET_SNAPSHOT_DIR:-$ROOT_DIR/backups/testnet-snapshots}"
KEEP="${QUBITOR_TESTNET_SNAPSHOT_KEEP:-14}"
HOST_SLUG="$(hostname -s 2>/dev/null || hostname || echo unknown-host)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_ROOT/$STAMP/$HOST_SLUG"

log() {
  echo "[qubitor-testnet-snapshot] $*"
}

warn() {
  echo "[qubitor-testnet-snapshot] warning: $*" >&2
}

rpc_call() {
  local method="$1"
  local params="${2:-[]}"
  curl -fsS \
    -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}" \
    "$RPC_URL" \
    | sed -n 's/.*"result":"\([^"]*\)".*/\1/p'
}

first_container_matching() {
  local pattern="$1"
  docker ps --format '{{.Names}}' 2>/dev/null | grep -E "$pattern" | head -n 1 || true
}

archive_dir_if_present() {
  local path="$1"
  local name="$2"
  if [[ ! -d "$path" ]]; then
    warn "skipping missing directory ${path#$ROOT_DIR/}"
    return 0
  fi
  log "archiving ${path#$ROOT_DIR/}"
  tar -C "$(dirname "$path")" -czf "$DEST/$name.tar.gz" "$(basename "$path")"
}

mkdir -p "$DEST"

CHAIN_ID="$(rpc_call eth_chainId || true)"
HEAD_HEX="$(rpc_call eth_blockNumber || true)"
GENESIS_HASH="$(curl -fsS -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":2,"method":"eth_getBlockByNumber","params":["0x0",false]}' "$RPC_URL" | sed -n 's/.*"hash":"\([^"]*\)".*/\1/p' || true)"
LATEST_HASH=""
if [[ -n "$HEAD_HEX" ]]; then
  LATEST_HASH="$(curl -fsS -H 'content-type: application/json' --data "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"eth_getBlockByNumber\",\"params\":[\"$HEAD_HEX\",false]}" "$RPC_URL" | sed -n 's/.*"hash":"\([^"]*\)".*/\1/p' || true)"
fi

cat > "$DEST/manifest.txt" <<EOF
createdAt=$STAMP
host=$HOST_SLUG
repo=$ROOT_DIR
network=$NETWORK
rpcUrl=$RPC_URL
chainId=$CHAIN_ID
head=$HEAD_HEX
genesisHash=$GENESIS_HASH
latestHash=$LATEST_HASH
EOF

if command -v docker >/dev/null 2>&1; then
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' > "$DEST/docker-ps.txt" 2>/dev/null || true
fi

archive_dir_if_present "$ROOT_DIR/data/node/$NETWORK" "node-data-$NETWORK"
archive_dir_if_present "$ROOT_DIR/data/indexer/$NETWORK" "indexer-data-$NETWORK"
archive_dir_if_present "$ROOT_DIR/data/caddy/$NETWORK" "caddy-data-$NETWORK"

NODE_CONTAINER="${QUBITOR_TESTNET_NODE_CONTAINER:-$(first_container_matching 'qubitor.*qubitor-node')}"
if [[ -n "$NODE_CONTAINER" && "${QUBITOR_TESTNET_SNAPSHOT_EXPORT_CHAIN:-1}" == "1" ]]; then
  log "exporting chain from $NODE_CONTAINER"
  if docker exec "$NODE_CONTAINER" sh -lc 'rm -f /tmp/qubitor-chain-export.rlp /tmp/qubitor-chain-export.log; geth --datadir=/data export /tmp/qubitor-chain-export.rlp >/tmp/qubitor-chain-export.log 2>&1 && gzip -c /tmp/qubitor-chain-export.rlp' > "$DEST/qubitor-chain-export.rlp.gz"; then
    docker exec "$NODE_CONTAINER" sh -lc 'rm -f /tmp/qubitor-chain-export.rlp /tmp/qubitor-chain-export.log' >/dev/null 2>&1 || true
  else
    warn "chain export failed; keeping data archive and manifest"
    rm -f "$DEST/qubitor-chain-export.rlp.gz"
    docker exec "$NODE_CONTAINER" sh -lc 'cat /tmp/qubitor-chain-export.log 2>/dev/null || true' > "$DEST/qubitor-chain-export-error.log" 2>/dev/null || true
  fi
fi

POSTGRES_CONTAINER="${QUBITOR_BRIDGE_POSTGRES_CONTAINER:-$(first_container_matching 'qubitor-bridge.*postgres')}"
if [[ -n "$POSTGRES_CONTAINER" ]]; then
  log "dumping bridge Postgres from $POSTGRES_CONTAINER"
  if docker exec "$POSTGRES_CONTAINER" pg_dump -U "${QUBITOR_BRIDGE_DB_USER:-qubitor}" -d "${QUBITOR_BRIDGE_DB_NAME:-qubitor_bridge}" | gzip -c > "$DEST/bridge-postgres.sql.gz"; then
    :
  else
    warn "bridge Postgres dump failed"
    rm -f "$DEST/bridge-postgres.sql.gz"
  fi
fi

if [[ -n "${QUBITOR_TESTNET_SNAPSHOT_RSYNC_TARGET:-}" ]]; then
  log "syncing snapshot to $QUBITOR_TESTNET_SNAPSHOT_RSYNC_TARGET"
  rsync -az "$DEST/" "$QUBITOR_TESTNET_SNAPSHOT_RSYNC_TARGET/$HOST_SLUG/$STAMP/"
fi

if [[ "$KEEP" =~ ^[0-9]+$ ]] && (( KEEP > 0 )); then
  mapfile -t old_dirs < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | awk -v keep="$KEEP" 'NR > keep {print $2}')
  for old in "${old_dirs[@]}"; do
    rm -rf "$old"
  done
fi

log "snapshot saved to $DEST"
