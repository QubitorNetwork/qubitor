#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ACCESS_ENV_PRIMARY="$ROOT_DIR/.env.testnet.local"
ACCESS_ENV_FALLBACK="$ROOT_DIR/.env.testnet"
REMOTE_ROOT="${QUBITOR_TESTNET_REMOTE_ROOT:-QubitorNetwork}"
PRIMARY_NODE_ENV="node-env/bootnode-1.env"
SECONDARY_NODE_ENV="node-env/bootnode-2.env"
DEFAULT_RPC_URL="https://testrpc2.qubitor.org"
DEFAULT_EXPLORER_URL="https://testexplorer2.qubitor.org"

fail() {
  echo "[qubitor-secondary-rpc] $*" >&2
  exit 1
}

warn() {
  echo "[qubitor-secondary-rpc] warning: $*" >&2
}

usage() {
  cat >&2 <<'EOF'
usage: pnpm testnet:secondary-rpc:<deploy|status|logs|restart> [service...]

Environment overrides:
  QUBITOR_TESTNET_SECONDARY_RPC_URL       default https://testrpc2.qubitor.org
  QUBITOR_TESTNET_SECONDARY_EXPLORER_URL  default https://testexplorer2.qubitor.org
  QUBITOR_TESTNET_SECONDARY_FAUCET_URL    default same as secondary RPC URL
  QUBITOR_TESTNET_SECONDARY_RPC_ALIASES
  QUBITOR_TESTNET_SECONDARY_EXPLORER_ALIASES
  QUBITOR_TESTNET_SECONDARY_FAUCET_ALIASES
EOF
}

shell_quote() {
  printf "%q" "$1"
}

load_access_env() {
  local primary_auth="" secondary_auth=""
  if [[ -f "$ACCESS_ENV_FALLBACK" ]]; then
    # shellcheck disable=SC1090
    source "$ACCESS_ENV_FALLBACK"
    case "${QUBITOR_TESTNET_SERVER_AUTH:-}" in
      key|password|"") ;;
      *) primary_auth="$QUBITOR_TESTNET_SERVER_AUTH" ;;
    esac
    case "${QUBITOR_TESTNET_BOOTNODE_2_AUTH:-}" in
      key|password|"") ;;
      *) secondary_auth="$QUBITOR_TESTNET_BOOTNODE_2_AUTH" ;;
    esac
  fi
  if [[ -f "$ACCESS_ENV_PRIMARY" ]]; then
    # shellcheck disable=SC1090
    source "$ACCESS_ENV_PRIMARY"
    case "${QUBITOR_TESTNET_SERVER_AUTH:-}" in
      key|password|"") ;;
      *) primary_auth="$QUBITOR_TESTNET_SERVER_AUTH" ;;
    esac
    case "${QUBITOR_TESTNET_BOOTNODE_2_AUTH:-}" in
      key|password|"") ;;
      *) secondary_auth="$QUBITOR_TESTNET_BOOTNODE_2_AUTH" ;;
    esac
  fi

  : "${QUBITOR_TESTNET_BOOTNODE_2_HOST:?QUBITOR_TESTNET_BOOTNODE_2_HOST is required}"
  : "${QUBITOR_TESTNET_BOOTNODE_2_USER:?QUBITOR_TESTNET_BOOTNODE_2_USER is required}"
  : "${QUBITOR_TESTNET_BOOTNODE_2_SSH_PORT:=22}"
  : "${QUBITOR_TESTNET_SERVER_SSH_KEY:=~/.ssh/id_ed25519}"
  : "${QUBITOR_TESTNET_BOOTNODE_2_SSH_KEY:=$QUBITOR_TESTNET_SERVER_SSH_KEY}"
  QUBITOR_TESTNET_SERVER_PASSWORD="${QUBITOR_TESTNET_SERVER_PASSWORD:-$primary_auth}"
  QUBITOR_TESTNET_BOOTNODE_2_PASSWORD="${QUBITOR_TESTNET_BOOTNODE_2_PASSWORD:-${secondary_auth:-${QUBITOR_TESTNET_SERVER_PASSWORD:-}}}"
}

expand_path() {
  local value="$1"
  if [[ "$value" == "~/"* ]]; then
    printf '%s/%s' "$HOME" "${value#~/}"
  else
    printf '%s' "$value"
  fi
}

ssh_base_options() {
  local port="$1"
  local key_file="$2"
  local -n out="$3"
  out=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -p "$port")
  if [[ -n "$key_file" && -f "$key_file" ]]; then
    out+=(-i "$key_file")
  fi
}

ssh_run() {
  local command="$1"
  local key_file
  key_file="$(expand_path "$QUBITOR_TESTNET_BOOTNODE_2_SSH_KEY")"
  local opts=()
  ssh_base_options "$QUBITOR_TESTNET_BOOTNODE_2_SSH_PORT" "$key_file" opts
  if ssh -o BatchMode=yes "${opts[@]}" "$QUBITOR_TESTNET_BOOTNODE_2_USER@$QUBITOR_TESTNET_BOOTNODE_2_HOST" "$command" 2>/tmp/qubitor-secondary-rpc-ssh-key.err; then
    return 0
  fi
  if [[ -z "${QUBITOR_TESTNET_BOOTNODE_2_PASSWORD:-}" ]]; then
    cat /tmp/qubitor-secondary-rpc-ssh-key.err >&2 || true
    return 1
  fi
  command -v sshpass >/dev/null 2>&1 || fail "sshpass is required for password fallback to $QUBITOR_TESTNET_BOOTNODE_2_HOST"
  SSHPASS="$QUBITOR_TESTNET_BOOTNODE_2_PASSWORD" sshpass -e ssh -o PubkeyAuthentication=no "${opts[@]}" "$QUBITOR_TESTNET_BOOTNODE_2_USER@$QUBITOR_TESTNET_BOOTNODE_2_HOST" "$command"
}

rsync_to_secondary() {
  local key_file
  key_file="$(expand_path "$QUBITOR_TESTNET_BOOTNODE_2_SSH_KEY")"
  local ssh_cmd="ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -p $QUBITOR_TESTNET_BOOTNODE_2_SSH_PORT"
  if [[ -n "$key_file" && -f "$key_file" ]]; then
    ssh_cmd="$ssh_cmd -i $key_file"
  fi
  local excludes=(
    --exclude .git
    --exclude node_modules
    --exclude data
    --exclude logs
    --exclude backups
    --exclude .turbo
    --exclude build
    --exclude artifacts/testnet/server-snapshots
  )
  if rsync -az --delete "${excludes[@]}" -e "$ssh_cmd" "$ROOT_DIR/" "$QUBITOR_TESTNET_BOOTNODE_2_USER@$QUBITOR_TESTNET_BOOTNODE_2_HOST:$REMOTE_ROOT/" 2>/tmp/qubitor-secondary-rpc-rsync-key.err; then
    return 0
  fi
  if [[ -z "${QUBITOR_TESTNET_BOOTNODE_2_PASSWORD:-}" ]]; then
    cat /tmp/qubitor-secondary-rpc-rsync-key.err >&2 || true
    return 1
  fi
  command -v sshpass >/dev/null 2>&1 || fail "sshpass is required for password fallback to $QUBITOR_TESTNET_BOOTNODE_2_HOST"
  SSHPASS="$QUBITOR_TESTNET_BOOTNODE_2_PASSWORD" sshpass -e rsync -az --delete "${excludes[@]}" -e "$ssh_cmd -o PubkeyAuthentication=no" "$ROOT_DIR/" "$QUBITOR_TESTNET_BOOTNODE_2_USER@$QUBITOR_TESTNET_BOOTNODE_2_HOST:$REMOTE_ROOT/"
}

latest_launch_dir() {
  local launch_root="$ROOT_DIR/artifacts/testnet/launch"
  [[ -d "$launch_root" ]] || fail "missing launch material directory: ${launch_root#$ROOT_DIR/}"
  local latest
  latest="$(find "$launch_root" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | awk 'NR == 1 {print substr($0, index($0,$2))}')"
  [[ -n "$latest" ]] || fail "no launch material found under ${launch_root#$ROOT_DIR/}; run pnpm testnet:material:generate first"
  [[ -f "$latest/.env.testnet.local" ]] || fail "latest launch material is missing .env.testnet.local: ${latest#$ROOT_DIR/}"
  [[ -f "$latest/$SECONDARY_NODE_ENV" ]] || fail "latest launch material is missing $SECONDARY_NODE_ENV: ${latest#$ROOT_DIR/}"
  printf '%s' "$latest"
}

secondary_urls() {
  SECONDARY_RPC_URL="${QUBITOR_TESTNET_SECONDARY_RPC_URL:-${QUBITOR_SECONDARY_PUBLIC_RPC_URL:-$DEFAULT_RPC_URL}}"
  SECONDARY_EXPLORER_URL="${QUBITOR_TESTNET_SECONDARY_EXPLORER_URL:-${QUBITOR_SECONDARY_PUBLIC_EXPLORER_URL:-$DEFAULT_EXPLORER_URL}}"
  SECONDARY_FAUCET_URL="${QUBITOR_TESTNET_SECONDARY_FAUCET_URL:-${QUBITOR_SECONDARY_PUBLIC_FAUCET_URL:-$SECONDARY_RPC_URL}}"
  SECONDARY_RPC_ALIASES="${QUBITOR_TESTNET_SECONDARY_RPC_ALIASES:-${QUBITOR_SECONDARY_PUBLIC_RPC_ALIASES:-}}"
  SECONDARY_EXPLORER_ALIASES="${QUBITOR_TESTNET_SECONDARY_EXPLORER_ALIASES:-${QUBITOR_SECONDARY_PUBLIC_EXPLORER_ALIASES:-}}"
  SECONDARY_FAUCET_ALIASES="${QUBITOR_TESTNET_SECONDARY_FAUCET_ALIASES:-${QUBITOR_SECONDARY_PUBLIC_FAUCET_ALIASES:-}}"
}

remote_env_exports() {
  cat <<REMOTE
export QUBITOR_PUBLIC_RPC_URL=$(shell_quote "$SECONDARY_RPC_URL")
export QUBITOR_PUBLIC_EXPLORER_URL=$(shell_quote "$SECONDARY_EXPLORER_URL")
export QUBITOR_PUBLIC_FAUCET_URL=$(shell_quote "$SECONDARY_FAUCET_URL")
export QUBITOR_PUBLIC_RPC_ALIASES=$(shell_quote "$SECONDARY_RPC_ALIASES")
export QUBITOR_PUBLIC_EXPLORER_ALIASES=$(shell_quote "$SECONDARY_EXPLORER_ALIASES")
export QUBITOR_PUBLIC_FAUCET_ALIASES=$(shell_quote "$SECONDARY_FAUCET_ALIASES")
REMOTE
}

remote_preamble() {
  local latest_rel="$1"
  cat <<REMOTE
set -euo pipefail
cd $(shell_quote "$REMOTE_ROOT")
LAUNCH_ENV=$(shell_quote "$latest_rel/.env.testnet.local")
NODE_ENV=$(shell_quote "$latest_rel/$SECONDARY_NODE_ENV")
COMPOSE="docker compose -f infra/docker-compose.yml -f infra/docker-compose.testnet.yml -f infra/docker-compose.public.yml"
test -f "\$LAUNCH_ENV"
test -f "\$NODE_ENV"
set -a
. "\$LAUNCH_ENV"
. "\$NODE_ENV"
set +a
$(remote_env_exports)
REMOTE
}

remote_health_checks() {
  cat <<'REMOTE'
wait_json_rpc() {
  url="$1"
  payload="$2"
  for i in $(seq 1 60); do
    if curl -fsS -H 'content-type: application/json' --data "$payload" "$url" >/tmp/qubitor-secondary-health.json 2>/dev/null; then
      cat /tmp/qubitor-secondary-health.json
      rm -f /tmp/qubitor-secondary-health.json
      return 0
    fi
    sleep 2
  done
  curl -fsS -H 'content-type: application/json' --data "$payload" "$url"
}

wait_http() {
  url="$1"
  for i in $(seq 1 60); do
    if curl -fsS "$url" >/tmp/qubitor-secondary-health.json 2>/dev/null; then
      cat /tmp/qubitor-secondary-health.json
      rm -f /tmp/qubitor-secondary-health.json
      return 0
    fi
    sleep 2
  done
  curl -fsS "$url"
}

for i in $(seq 1 60); do
  if curl -fsS -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' http://127.0.0.1:8545 >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
wait_json_rpc http://127.0.0.1:8545 '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
wait_http http://127.0.0.1:18545/health
wait_http http://127.0.0.1:18546/faucet/status
wait_http http://127.0.0.1:18548/pq-dev/status
wait_http http://127.0.0.1:18547/health
wait_json_rpc http://127.0.0.1:8545 '{"jsonrpc":"2.0","id":2,"method":"net_peerCount","params":[]}'
REMOTE
}

service_args() {
  local service quoted=()
  for service in "$@"; do
    [[ "$service" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "invalid service name: $service"
    quoted+=("$(shell_quote "$service")")
  done
  printf '%s ' "${quoted[@]}"
}

deploy_secondary() {
  local latest latest_rel
  latest="$(latest_launch_dir)"
  latest_rel="${latest#"$ROOT_DIR/"}"

  echo "[qubitor-secondary-rpc] syncing bootnode 2 ${QUBITOR_TESTNET_BOOTNODE_2_HOST}"
  rsync_to_secondary

  echo "[qubitor-secondary-rpc] starting secondary public stack from $latest_rel"
  ssh_run "$(cat <<REMOTE
$(remote_preamble "$latest_rel")
corepack enable >/dev/null 2>&1 || true
CI=true pnpm install --frozen-lockfile
docker network inspect "\${QUBITOR_BRIDGE_BACKEND_NETWORK:-qubitor-bridge-testnet_default}" >/dev/null 2>&1 || docker network create "\${QUBITOR_BRIDGE_BACKEND_NETWORK:-qubitor-bridge-testnet_default}" >/dev/null
  \$COMPOSE --profile all up -d --build --remove-orphans
$(remote_health_checks)
REMOTE
)"

  echo "[qubitor-secondary-rpc] secondary RPC: $SECONDARY_RPC_URL/rpc"
  echo "[qubitor-secondary-rpc] secondary explorer: $SECONDARY_EXPLORER_URL"
}

status_secondary() {
  local latest latest_rel
  latest="$(latest_launch_dir)"
  latest_rel="${latest#"$ROOT_DIR/"}"
  ssh_run "$(cat <<REMOTE
$(remote_preamble "$latest_rel")
echo "[qubitor-secondary-rpc] host ${QUBITOR_TESTNET_BOOTNODE_2_HOST}"
echo "[qubitor-secondary-rpc] rpc $SECONDARY_RPC_URL/rpc"
echo "[qubitor-secondary-rpc] explorer $SECONDARY_EXPLORER_URL"
\$COMPOSE --profile all ps
$(remote_health_checks)
REMOTE
)"
}

logs_secondary() {
  local latest latest_rel tail services
  latest="$(latest_launch_dir)"
  latest_rel="${latest#"$ROOT_DIR/"}"
  tail="${QUBITOR_SECONDARY_RPC_LOG_TAIL:-200}"
  if [[ "$#" -gt 0 ]]; then
    services="$(service_args "$@")"
  else
    services="$(service_args public-gateway rpc-gateway qubitor-node)"
  fi
  ssh_run "$(cat <<REMOTE
$(remote_preamble "$latest_rel")
\$COMPOSE --profile all logs --tail=$(shell_quote "$tail") $services
REMOTE
)"
}

restart_secondary() {
  local latest latest_rel services
  latest="$(latest_launch_dir)"
  latest_rel="${latest#"$ROOT_DIR/"}"
  if [[ "$#" -gt 0 ]]; then
    services="$(service_args "$@")"
  else
    services="$(service_args public-gateway rpc-gateway faucet-api pq-relayer-api indexer explorer-lite)"
  fi
  ssh_run "$(cat <<REMOTE
$(remote_preamble "$latest_rel")
\$COMPOSE --profile all restart $services
$(remote_health_checks)
REMOTE
)"
}

main() {
  local command="${1:-}"
  if [[ -z "$command" || "$command" == "-h" || "$command" == "--help" ]]; then
    usage
    exit 0
  fi
  shift || true

  load_access_env
  secondary_urls

  case "$command" in
    deploy) deploy_secondary "$@" ;;
    status) status_secondary "$@" ;;
    logs) logs_secondary "$@" ;;
    restart) restart_secondary "$@" ;;
    *) usage; fail "unknown command: $command" ;;
  esac
}

main "$@"
