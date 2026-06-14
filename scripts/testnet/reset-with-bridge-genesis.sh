#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ACCESS_ENV_PRIMARY="$ROOT_DIR/.env.testnet.local"
ACCESS_ENV_FALLBACK="$ROOT_DIR/.env.testnet"
REMOTE_ROOT="${QUBITOR_TESTNET_REMOTE_ROOT:-QubitorNetwork}"
PRIMARY_NODE_ENV="node-env/bootnode-1.env"
SECONDARY_NODE_ENV="node-env/bootnode-2.env"
RESET_CONFIRM_VALUE="RESET_QUBITOR_TESTNET_91338"

fail() {
  echo "[qubitor-testnet-reset] $*" >&2
  exit 1
}

warn() {
  echo "[qubitor-testnet-reset] warning: $*" >&2
}

require_reset_confirmation() {
  if [[ "${QUBITOR_TESTNET_RESET_CONFIRM:-}" != "$RESET_CONFIRM_VALUE" ]]; then
    fail "refusing to reset testnet without explicit confirmation. Run: QUBITOR_TESTNET_RESET_CONFIRM=$RESET_CONFIRM_VALUE pnpm testnet:reset-with-bridge-genesis"
  fi
}

load_access_env() {
  local primary_auth="" primary2_auth=""
  if [[ -f "$ACCESS_ENV_FALLBACK" ]]; then
    # shellcheck disable=SC1090
    source "$ACCESS_ENV_FALLBACK"
    case "${QUBITOR_TESTNET_SERVER_AUTH:-}" in
      key|password|"") ;;
      *) primary_auth="$QUBITOR_TESTNET_SERVER_AUTH" ;;
    esac
    case "${QUBITOR_TESTNET_BOOTNODE_2_AUTH:-}" in
      key|password|"") ;;
      *) primary2_auth="$QUBITOR_TESTNET_BOOTNODE_2_AUTH" ;;
    esac
  fi
  if [[ -f "$ACCESS_ENV_PRIMARY" ]]; then
    # shellcheck disable=SC1090
    source "$ACCESS_ENV_PRIMARY"
  fi
  : "${QUBITOR_TESTNET_SERVER_HOST:?QUBITOR_TESTNET_SERVER_HOST is required}"
  : "${QUBITOR_TESTNET_SERVER_USER:?QUBITOR_TESTNET_SERVER_USER is required}"
  : "${QUBITOR_TESTNET_SERVER_SSH_PORT:=22}"
  : "${QUBITOR_TESTNET_SERVER_SSH_KEY:=~/.ssh/id_ed25519}"
  QUBITOR_TESTNET_SERVER_PASSWORD="${QUBITOR_TESTNET_SERVER_PASSWORD:-$primary_auth}"
  QUBITOR_TESTNET_BOOTNODE_2_PASSWORD="${QUBITOR_TESTNET_BOOTNODE_2_PASSWORD:-$primary2_auth}"
  : "${QUBITOR_TESTNET_ALLOW_SECONDARY_OFFLINE:=0}"
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
  local host="$1" user="$2" port="$3" key_path="$4" password="$5"
  shift 5
  local key_file
  key_file="$(expand_path "$key_path")"
  local opts=()
  ssh_base_options "$port" "$key_file" opts
  if ssh -o BatchMode=yes "${opts[@]}" "$user@$host" "$@" 2>/tmp/qubitor-ssh-key.err; then
    return 0
  fi
  if [[ -z "$password" ]]; then
    cat /tmp/qubitor-ssh-key.err >&2 || true
    return 1
  fi
  command -v sshpass >/dev/null 2>&1 || fail "sshpass is required for password fallback to $host"
  SSHPASS="$password" sshpass -e ssh -o PubkeyAuthentication=no "${opts[@]}" "$user@$host" "$@"
}

rsync_to_host() {
  local host="$1" user="$2" port="$3" key_path="$4" password="$5"
  local key_file
  key_file="$(expand_path "$key_path")"
  local ssh_cmd="ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -p $port"
  if [[ -n "$key_file" && -f "$key_file" ]]; then
    ssh_cmd="$ssh_cmd -i $key_file"
  fi
  local excludes=(
    --exclude .git
    --exclude node_modules
    --exclude data
    --exclude logs
    --exclude .turbo
    --exclude build
  )
  if rsync -az --delete "${excludes[@]}" -e "$ssh_cmd" "$ROOT_DIR/" "$user@$host:$REMOTE_ROOT/" 2>/tmp/qubitor-rsync-key.err; then
    return 0
  fi
  if [[ -z "$password" ]]; then
    cat /tmp/qubitor-rsync-key.err >&2 || true
    return 1
  fi
  command -v sshpass >/dev/null 2>&1 || fail "sshpass is required for password fallback to $host"
  SSHPASS="$password" sshpass -e rsync -az --delete "${excludes[@]}" -e "$ssh_cmd -o PubkeyAuthentication=no" "$ROOT_DIR/" "$user@$host:$REMOTE_ROOT/"
}

remote_reset_command() {
  local env_file="$1" node_env_file="$2" profiles="$3"
  local reset_confirm="${QUBITOR_TESTNET_RESET_CONFIRM:-}"
  cat <<REMOTE
set -euo pipefail
cd "$REMOTE_ROOT"
corepack enable >/dev/null 2>&1 || true
CI=true pnpm install --frozen-lockfile
node scripts/testnet/verify-bridge-genesis.mjs
set -a
. "$env_file"
. "$node_env_file"
set +a
if [[ "$reset_confirm" != "$RESET_CONFIRM_VALUE" ]]; then
  echo "[qubitor-testnet-reset] remote reset refused; QUBITOR_TESTNET_RESET_CONFIRM must be $RESET_CONFIRM_VALUE" >&2
  exit 1
fi

backup_testnet_state() {
  local pre_reset_head="\$1"
  local backup_root="\${QUBITOR_TESTNET_RESET_BACKUP_DIR:-backups/testnet-reset}"
  local backup_stamp="\${QUBITOR_TESTNET_RESET_BACKUP_STAMP:-\$(date -u +%Y%m%dT%H%M%SZ)}"
  local host_slug
  host_slug="\$(hostname | tr -c 'A-Za-z0-9_.-' '-')"
  local backup_dir="\$backup_root/\$backup_stamp/\$host_slug"
  mkdir -p "\$backup_dir"
  chmod 700 "\$backup_root" "\$backup_root/\$backup_stamp" "\$backup_dir" 2>/dev/null || true

  {
    printf 'createdAt=%s\\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'hostname=%s\\n' "\$(hostname)"
    printf 'remoteRoot=%s\\n' "$REMOTE_ROOT"
    printf 'envFile=%s\\n' "$env_file"
    printf 'nodeEnvFile=%s\\n' "$node_env_file"
    printf 'profiles=%s\\n' "$profiles"
    printf 'preResetHead=%s\\n' "\$pre_reset_head"
    printf 'network=%s\\n' "\${QUBITOR_NETWORK:-}"
    printf 'networkId=%s\\n' "\${QUBITOR_NETWORK_ID:-}"
    printf 'bootnodes=%s\\n' "\${QUBITOR_BOOTNODES:-}"
    printf '\\n[docker ps]\\n'
    docker ps --format '{{.Names}} {{.CreatedAt}} {{.Status}}' 2>/dev/null || true
    printf '\\n[qubitor containers]\\n'
    docker ps -a --filter 'name=qubitor-network' --format '{{.Names}} {{.CreatedAt}} {{.Status}}' 2>/dev/null || true
  } > "\$backup_dir/manifest.txt"

  local wrote=0
  local path archive
  for path in data/node/testnet data/indexer/testnet data/caddy/testnet; do
    if [[ -e "\$path" ]]; then
      archive="\${path//\//__}.tar.gz"
      echo "[qubitor-testnet-reset] backing up \$path to \$backup_dir/\$archive"
      tar -czf "\$backup_dir/\$archive" "\$path"
      wrote=1
    fi
  done
  if [[ "\$wrote" == "0" ]]; then
    echo "[qubitor-testnet-reset] no existing testnet data found to back up" | tee -a "\$backup_dir/manifest.txt"
  fi
  echo "[qubitor-testnet-reset] backup manifest: \$backup_dir/manifest.txt"
}

pre_reset_head="\$(curl -fsS -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' http://127.0.0.1:8545 2>/dev/null || true)"
docker compose -f infra/docker-compose.yml -f infra/docker-compose.testnet.yml -f infra/docker-compose.public.yml --profile all down --remove-orphans || true
docker compose -p qubitor-network down --remove-orphans || true
docker compose -p qubitor-network-testnet down --remove-orphans || true
docker compose -p qubitor-network-public down --remove-orphans || true
backup_testnet_state "\$pre_reset_head"
docker ps -aq --filter 'name=qubitor-network' | xargs -r docker rm -f || true
rm -rf data/node/testnet data/indexer/testnet data/caddy/testnet
docker compose -f infra/docker-compose.yml -f infra/docker-compose.testnet.yml -f infra/docker-compose.public.yml $profiles up -d --build
for i in \$(seq 1 60); do
  if curl -fsS -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' http://127.0.0.1:8545 >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
node scripts/testnet/verify-bridge-genesis.mjs --rpc=http://127.0.0.1:8545
REMOTE
}

main() {
  cd "$ROOT_DIR"
  load_access_env
  require_reset_confirmation

  echo "[qubitor-testnet-reset] verifying local bridge genesis"
  node scripts/testnet/verify-bridge-genesis.mjs

  echo "[qubitor-testnet-reset] generating fresh testnet launch material"
  QUBITOR_BOOTNODE_MIN_COUNT="${QUBITOR_BOOTNODE_MIN_COUNT:-2}" \
  QUBITOR_PUBLIC_RPC_URL="${QUBITOR_PUBLIC_RPC_URL:-https://testrpc.qubitor.org}" \
  QUBITOR_PUBLIC_EXPLORER_URL="${QUBITOR_PUBLIC_EXPLORER_URL:-https://testexplorer.qubitor.org}" \
  QUBITOR_PUBLIC_FAUCET_URL="${QUBITOR_PUBLIC_FAUCET_URL:-https://testrpc.qubitor.org}" \
  QUBITOR_PUBLIC_BRIDGE_API_URL="${QUBITOR_PUBLIC_BRIDGE_API_URL:-https://api.0xq.app}" \
  QUBITOR_BRIDGE_BACKEND_NETWORK="${QUBITOR_BRIDGE_BACKEND_NETWORK:-qubitor-bridge-testnet_default}" \
    pnpm testnet:material:generate

  local latest
  latest="$(ls -td artifacts/testnet/launch/* | head -n 1)"
  [[ -n "$latest" ]] || fail "could not find generated launch material"
  local latest_rel="${latest#"$ROOT_DIR/"}"
  local launch_env="$latest_rel/.env.testnet.local"

  echo "[qubitor-testnet-reset] preflighting generated launch material"
  QUBITOR_TESTNET_ENV_FILE="$latest/.env.testnet.local" pnpm testnet:launch-preflight

  echo "[qubitor-testnet-reset] syncing primary ${QUBITOR_TESTNET_SERVER_HOST}"
  rsync_to_host \
    "$QUBITOR_TESTNET_SERVER_HOST" \
    "$QUBITOR_TESTNET_SERVER_USER" \
    "$QUBITOR_TESTNET_SERVER_SSH_PORT" \
    "$QUBITOR_TESTNET_SERVER_SSH_KEY" \
    "$QUBITOR_TESTNET_SERVER_PASSWORD"

  if [[ -n "${QUBITOR_TESTNET_BOOTNODE_2_HOST:-}" ]]; then
    : "${QUBITOR_TESTNET_BOOTNODE_2_USER:?QUBITOR_TESTNET_BOOTNODE_2_USER is required}"
    : "${QUBITOR_TESTNET_BOOTNODE_2_SSH_PORT:=22}"
    : "${QUBITOR_TESTNET_BOOTNODE_2_SSH_KEY:=$QUBITOR_TESTNET_SERVER_SSH_KEY}"
    echo "[qubitor-testnet-reset] syncing secondary ${QUBITOR_TESTNET_BOOTNODE_2_HOST}"
    if ! rsync_to_host \
      "$QUBITOR_TESTNET_BOOTNODE_2_HOST" \
      "$QUBITOR_TESTNET_BOOTNODE_2_USER" \
      "$QUBITOR_TESTNET_BOOTNODE_2_SSH_PORT" \
      "$QUBITOR_TESTNET_BOOTNODE_2_SSH_KEY" \
      "$QUBITOR_TESTNET_BOOTNODE_2_PASSWORD"; then
      if [[ "$QUBITOR_TESTNET_ALLOW_SECONDARY_OFFLINE" != "1" ]]; then
        fail "secondary ${QUBITOR_TESTNET_BOOTNODE_2_HOST} is unavailable; set QUBITOR_TESTNET_ALLOW_SECONDARY_OFFLINE=1 to reset primary only"
      fi
      warn "secondary ${QUBITOR_TESTNET_BOOTNODE_2_HOST} is unavailable; continuing with primary reset only"
      QUBITOR_TESTNET_BOOTNODE_2_HOST=""
    fi

    if [[ -n "${QUBITOR_TESTNET_BOOTNODE_2_HOST:-}" ]]; then
      echo "[qubitor-testnet-reset] resetting secondary node"
      if ! ssh_run \
        "$QUBITOR_TESTNET_BOOTNODE_2_HOST" \
        "$QUBITOR_TESTNET_BOOTNODE_2_USER" \
        "$QUBITOR_TESTNET_BOOTNODE_2_SSH_PORT" \
        "$QUBITOR_TESTNET_BOOTNODE_2_SSH_KEY" \
        "$QUBITOR_TESTNET_BOOTNODE_2_PASSWORD" \
        "$(remote_reset_command "$launch_env" "$latest_rel/$SECONDARY_NODE_ENV" "--profile node")"; then
        if [[ "$QUBITOR_TESTNET_ALLOW_SECONDARY_OFFLINE" != "1" ]]; then
          fail "secondary ${QUBITOR_TESTNET_BOOTNODE_2_HOST} reset failed; set QUBITOR_TESTNET_ALLOW_SECONDARY_OFFLINE=1 to reset primary only"
        fi
        warn "secondary ${QUBITOR_TESTNET_BOOTNODE_2_HOST} reset failed; continuing with primary reset only"
      fi
    fi
  fi

  echo "[qubitor-testnet-reset] resetting primary node and public services"
  ssh_run \
    "$QUBITOR_TESTNET_SERVER_HOST" \
    "$QUBITOR_TESTNET_SERVER_USER" \
    "$QUBITOR_TESTNET_SERVER_SSH_PORT" \
    "$QUBITOR_TESTNET_SERVER_SSH_KEY" \
    "$QUBITOR_TESTNET_SERVER_PASSWORD" \
    "$(remote_reset_command "$launch_env" "$latest_rel/$PRIMARY_NODE_ENV" "--profile all")"

  echo "[qubitor-testnet-reset] ok"
}

main "$@"
