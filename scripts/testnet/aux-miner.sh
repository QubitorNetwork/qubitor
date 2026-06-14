#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/testnet/server-access-lib.sh
source "$ROOT_DIR/scripts/testnet/server-access-lib.sh"

DEFAULT_TARGET="${QUBITOR_AUX_MINER_TARGET:-secondary}"
DEFAULT_NAME="${QUBITOR_AUX_MINER_NAME:-aux-miner-1}"

fail() {
  echo "[qubitor-aux-miner] $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
usage: pnpm testnet:aux-miner:<deploy|status|logs|restart|stop> [primary|secondary]

Starts a separate no-reset auxiliary testnet miner/full-node with:
  - a separate Docker Compose project
  - a separate data directory under data/node/testnet-aux-miner-*
  - a separate generated PQ reward wallet
  - separate RPC/P2P ports

It never deletes, reinitializes, or mounts data/node/testnet.
EOF
}

latest_launch_dir() {
  local launch_root="$ROOT_DIR/artifacts/testnet/launch"
  [[ -d "$launch_root" ]] || fail "missing launch material directory: ${launch_root#$ROOT_DIR/}"
  local latest
  latest="$(find "$launch_root" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | awk 'NR == 1 {print substr($0, index($0,$2))}')"
  [[ -n "$latest" ]] || fail "no launch material found under ${launch_root#$ROOT_DIR/}"
  [[ -f "$latest/.env.testnet.local" ]] || fail "latest launch material is missing .env.testnet.local"
  printf '%s' "$latest"
}

target_default_ports() {
  local target="$1"
  if [[ "$target" == "primary" ]]; then
    AUX_RPC_PORT="${QUBITOR_AUX_MINER_RPC_PORT:-127.0.0.1:8565}"
    AUX_WS_PORT="${QUBITOR_AUX_MINER_WS_PORT:-127.0.0.1:8566}"
    AUX_P2P_PORT="${QUBITOR_AUX_MINER_P2P_PORT:-30323}"
  else
    AUX_RPC_PORT="${QUBITOR_AUX_MINER_RPC_PORT:-127.0.0.1:8555}"
    AUX_WS_PORT="${QUBITOR_AUX_MINER_WS_PORT:-127.0.0.1:8556}"
    AUX_P2P_PORT="${QUBITOR_AUX_MINER_P2P_PORT:-30313}"
  fi
}

generate_wallet() {
  local target="$1" name="$2" out_dir wallet_file
  out_dir="$ROOT_DIR/artifacts/testnet/aux-miners/$(date -u +%Y%m%dT%H%M%SZ)-$target-$name"
  wallet_file="$out_dir/pq-miner-wallet.json"
  mkdir -p "$out_dir"
  chmod 700 "$out_dir"
  (
    cd "$ROOT_DIR"
    pnpm --filter @qubitor/pq-native-tx exec tsx -e '
      import { randomBytes } from "node:crypto";
      import {
        QUBITOR_ZERO_HASH,
        bytesToHex,
        deriveQubitorPQAccountAddress,
        generateMLDSA65KeyPair,
      } from "./src/index";

      const seed = bytesToHex(randomBytes(32));
      const keypair = generateMLDSA65KeyPair(seed);
      const payload = {
        label: process.argv[1],
        generatedAt: new Date().toISOString(),
        seed,
        publicKey: keypair.publicKey,
        address: deriveQubitorPQAccountAddress(keypair.publicKey, QUBITOR_ZERO_HASH),
        salt: QUBITOR_ZERO_HASH,
        note: "Private testnet auxiliary miner PQ wallet. The address can receive PoW rewards; the seed controls spending.",
      };
      console.log(JSON.stringify(payload, null, 2));
    ' "$target-$name" > "$wallet_file"
  )
  chmod 600 "$wallet_file"
  AUX_WALLET_FILE="$wallet_file"
  AUX_MINER_ADDRESS="$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).address)' "$wallet_file")"
  echo "[qubitor-aux-miner] generated private PQ reward wallet $wallet_file"
  echo "[qubitor-aux-miner] auxiliary reward address $AUX_MINER_ADDRESS"
}

remote_aux_env_path() {
  local name="$1"
  printf 'artifacts/testnet/aux-miners/%s/aux-miner.env' "$name"
}

compose_project() {
  local name="$1"
  printf 'qubitor-aux-miner-%s' "$(printf '%s' "$name" | tr -cd 'A-Za-z0-9_.-' | tr '[:upper:]' '[:lower:]')"
}

remote_cd_command() {
  if [[ "$REMOTE_ROOT" == /* ]]; then
    printf 'cd %s\n' "$(shell_quote "$REMOTE_ROOT")"
  else
    printf 'if [ -d "$HOME/%s" ]; then cd "$HOME/%s"; else cd %s; fi\n' \
      "$(shell_quote "$REMOTE_ROOT")" \
      "$(shell_quote "$REMOTE_ROOT")" \
      "$(shell_quote "$REMOTE_ROOT")"
  fi
}

remote_preamble() {
  local launch_rel="$1" aux_env="$2" project="$3"
  cat <<REMOTE
set -euo pipefail
$(remote_cd_command)
LAUNCH_ENV=$(shell_quote "$launch_rel/.env.testnet.local")
AUX_ENV=$(shell_quote "$aux_env")
COMPOSE="docker compose -p $(shell_quote "$project") -f infra/docker-compose.aux-miner.yml"
test -f "\$LAUNCH_ENV"
test -f "\$AUX_ENV"
set -a
. "\$LAUNCH_ENV"
. "\$AUX_ENV"
set +a
REMOTE
}

remote_health_checks() {
  cat <<'REMOTE'
for i in $(seq 1 90); do
  if curl -fsS -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$QUBITOR_AUX_MINER_HEALTH_RPC" >/tmp/qubitor-aux-miner-health.json 2>/dev/null; then
    cat /tmp/qubitor-aux-miner-health.json
    rm -f /tmp/qubitor-aux-miner-health.json
    break
  fi
  sleep 2
done
curl -fsS -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":2,"method":"net_peerCount","params":[]}' "$QUBITOR_AUX_MINER_HEALTH_RPC"
curl -fsS -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":3,"method":"eth_mining","params":[]}' "$QUBITOR_AUX_MINER_HEALTH_RPC"
curl -fsS -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":4,"method":"eth_blockNumber","params":[]}' "$QUBITOR_AUX_MINER_HEALTH_RPC"
curl -fsS -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":5,"method":"eth_syncing","params":[]}' "$QUBITOR_AUX_MINER_HEALTH_RPC"
curl -fsS -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":6,"method":"eth_hashrate","params":[]}' "$QUBITOR_AUX_MINER_HEALTH_RPC"
REMOTE
}

write_remote_env() {
  local target="$1" name="$2" address="$3" aux_env="$4"
  local data_label="testnet-aux-miner-$name"
  [[ "$data_label" != "testnet" && "$data_label" == testnet-aux-miner-* ]] || fail "unsafe aux data label: $data_label"
  local nat=""
  local host
  host="$(target_host "$target")"
  if [[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    nat="extip:$host"
  fi
  local health_rpc="http://127.0.0.1:${AUX_RPC_PORT#127.0.0.1:}"
  ssh_run_target "$target" "$(cat <<REMOTE
set -euo pipefail
$(remote_cd_command)
mkdir -p $(shell_quote "$(dirname "$aux_env")")
cat > $(shell_quote "$aux_env") <<'ENV'
QUBITOR_AUX_MINER_ALLOW_INIT=1
QUBITOR_AUX_MINER_DATA_LABEL=$data_label
QUBITOR_AUX_MINER_ETHERBASE=$address
QUBITOR_AUX_MINER_THREADS=${QUBITOR_AUX_MINER_THREADS:-1}
QUBITOR_AUX_MINER_RPC_PORT=$AUX_RPC_PORT
QUBITOR_AUX_MINER_WS_PORT=$AUX_WS_PORT
QUBITOR_AUX_MINER_P2P_PORT=$AUX_P2P_PORT
QUBITOR_AUX_MINER_P2P_TCP_PORT=$AUX_P2P_PORT
QUBITOR_AUX_MINER_P2P_UDP_PORT=$AUX_P2P_PORT
QUBITOR_AUX_MINER_NAT=$nat
QUBITOR_AUX_MINER_HEALTH_RPC=$health_rpc
ENV
chmod 600 $(shell_quote "$aux_env")
REMOTE
)"
}

deploy_aux() {
  local target="$1" name="$2" latest latest_rel aux_env project
  target_default_ports "$target"
  generate_wallet "$target" "$name"
  latest="$(latest_launch_dir)"
  latest_rel="${latest#"$ROOT_DIR/"}"
  aux_env="$(remote_aux_env_path "$name")"
  project="$(compose_project "$name")"

  echo "[qubitor-aux-miner] syncing repo to $target without runtime data"
  rsync_repo_to_target "$target"
  rsync_to_target "$target" "$latest/" "$REMOTE_ROOT/$latest_rel/"
  write_remote_env "$target" "$name" "$AUX_MINER_ADDRESS" "$aux_env"

  echo "[qubitor-aux-miner] starting $project on $target"
  ssh_run_target "$target" "$(cat <<REMOTE
$(remote_preamble "$latest_rel" "$aux_env" "$project")
corepack enable >/dev/null 2>&1 || true
CI=true pnpm install --frozen-lockfile
\$COMPOSE up -d --build
$(remote_health_checks)
REMOTE
)"
}

status_aux() {
  local target="$1" name="$2" latest latest_rel aux_env project
  latest="$(latest_launch_dir)"
  latest_rel="${latest#"$ROOT_DIR/"}"
  aux_env="$(remote_aux_env_path "$name")"
  project="$(compose_project "$name")"
  ssh_run_target "$target" "$(cat <<REMOTE
$(remote_preamble "$latest_rel" "$aux_env" "$project")
echo "[qubitor-aux-miner] target=$target project=$project address=\$QUBITOR_AUX_MINER_ETHERBASE data=\$QUBITOR_AUX_MINER_DATA_LABEL"
\$COMPOSE ps
$(remote_health_checks)
REMOTE
)"
}

logs_aux() {
  local target="$1" name="$2" latest latest_rel aux_env project
  latest="$(latest_launch_dir)"
  latest_rel="${latest#"$ROOT_DIR/"}"
  aux_env="$(remote_aux_env_path "$name")"
  project="$(compose_project "$name")"
  ssh_run_target "$target" "$(cat <<REMOTE
$(remote_preamble "$latest_rel" "$aux_env" "$project")
\$COMPOSE logs --tail=${QUBITOR_AUX_MINER_LOG_TAIL:-200}
REMOTE
)"
}

restart_aux() {
  local target="$1" name="$2" latest latest_rel aux_env project
  latest="$(latest_launch_dir)"
  latest_rel="${latest#"$ROOT_DIR/"}"
  aux_env="$(remote_aux_env_path "$name")"
  project="$(compose_project "$name")"
  local requested_threads="${QUBITOR_AUX_MINER_THREADS:-}"
  if [[ -n "$requested_threads" && ! "$requested_threads" =~ ^[1-9][0-9]*$ ]]; then
    fail "QUBITOR_AUX_MINER_THREADS must be a positive integer"
  fi
  ssh_run_target "$target" "$(cat <<REMOTE
set -euo pipefail
$(remote_cd_command)
if [ -n $(shell_quote "$requested_threads") ]; then
  test -f $(shell_quote "$aux_env")
  sed -i -E 's/^QUBITOR_AUX_MINER_THREADS=.*/QUBITOR_AUX_MINER_THREADS=$(shell_quote "$requested_threads")/' $(shell_quote "$aux_env")
fi
$(remote_preamble "$latest_rel" "$aux_env" "$project")
if [ -n $(shell_quote "$requested_threads") ]; then
  \$COMPOSE up -d --force-recreate aux-miner
else
  \$COMPOSE restart aux-miner
fi
$(remote_health_checks)
REMOTE
)"
}

stop_aux() {
  local target="$1" name="$2" latest latest_rel aux_env project
  latest="$(latest_launch_dir)"
  latest_rel="${latest#"$ROOT_DIR/"}"
  aux_env="$(remote_aux_env_path "$name")"
  project="$(compose_project "$name")"
  ssh_run_target "$target" "$(cat <<REMOTE
$(remote_preamble "$latest_rel" "$aux_env" "$project")
\$COMPOSE stop aux-miner
REMOTE
)"
}

main() {
  local command="${1:-}" target="${2:-$DEFAULT_TARGET}" name="${QUBITOR_AUX_MINER_NAME:-$DEFAULT_NAME}"
  if [[ -z "$command" || "$command" == "-h" || "$command" == "--help" ]]; then
    usage
    exit 0
  fi
  load_testnet_access_env
  case "$target" in primary|secondary) ;; *) fail "target must be primary or secondary" ;; esac
  case "$command" in
    deploy) deploy_aux "$target" "$name" ;;
    status) status_aux "$target" "$name" ;;
    logs) logs_aux "$target" "$name" ;;
    restart) restart_aux "$target" "$name" ;;
    stop) stop_aux "$target" "$name" ;;
    *) usage; fail "unknown command: $command" ;;
  esac
}

main "$@"
