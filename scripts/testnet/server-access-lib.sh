#!/usr/bin/env bash

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ACCESS_ENV_PRIMARY="$ROOT_DIR/.env.testnet.local"
ACCESS_ENV_FALLBACK="$ROOT_DIR/.env.testnet"
REMOTE_ROOT="${QUBITOR_TESTNET_REMOTE_ROOT:-QubitorNetwork}"

fail() {
  echo "[qubitor-testnet-ops] $*" >&2
  exit 1
}

warn() {
  echo "[qubitor-testnet-ops] warning: $*" >&2
}

shell_quote() {
  printf "%q" "$1"
}

expand_path() {
  local value="$1"
  if [[ "$value" == "~/"* ]]; then
    printf '%s/%s' "$HOME" "${value#~/}"
  else
    printf '%s' "$value"
  fi
}

load_testnet_access_env() {
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

  : "${QUBITOR_TESTNET_SERVER_HOST:?QUBITOR_TESTNET_SERVER_HOST is required}"
  : "${QUBITOR_TESTNET_SERVER_USER:?QUBITOR_TESTNET_SERVER_USER is required}"
  : "${QUBITOR_TESTNET_SERVER_SSH_PORT:=22}"
  : "${QUBITOR_TESTNET_SERVER_SSH_KEY:=~/.ssh/id_ed25519}"
  : "${QUBITOR_TESTNET_BOOTNODE_2_HOST:?QUBITOR_TESTNET_BOOTNODE_2_HOST is required}"
  : "${QUBITOR_TESTNET_BOOTNODE_2_USER:?QUBITOR_TESTNET_BOOTNODE_2_USER is required}"
  : "${QUBITOR_TESTNET_BOOTNODE_2_SSH_PORT:=22}"
  : "${QUBITOR_TESTNET_BOOTNODE_2_SSH_KEY:=$QUBITOR_TESTNET_SERVER_SSH_KEY}"

  QUBITOR_TESTNET_SERVER_PASSWORD="${QUBITOR_TESTNET_SERVER_PASSWORD:-$primary_auth}"
  QUBITOR_TESTNET_BOOTNODE_2_PASSWORD="${QUBITOR_TESTNET_BOOTNODE_2_PASSWORD:-${secondary_auth:-${QUBITOR_TESTNET_SERVER_PASSWORD:-}}}"
}

target_host() {
  case "$1" in
    primary) printf '%s' "$QUBITOR_TESTNET_SERVER_HOST" ;;
    secondary) printf '%s' "$QUBITOR_TESTNET_BOOTNODE_2_HOST" ;;
    *) fail "unknown target: $1" ;;
  esac
}

target_user() {
  case "$1" in
    primary) printf '%s' "$QUBITOR_TESTNET_SERVER_USER" ;;
    secondary) printf '%s' "$QUBITOR_TESTNET_BOOTNODE_2_USER" ;;
    *) fail "unknown target: $1" ;;
  esac
}

target_port() {
  case "$1" in
    primary) printf '%s' "$QUBITOR_TESTNET_SERVER_SSH_PORT" ;;
    secondary) printf '%s' "$QUBITOR_TESTNET_BOOTNODE_2_SSH_PORT" ;;
    *) fail "unknown target: $1" ;;
  esac
}

target_key() {
  case "$1" in
    primary) expand_path "$QUBITOR_TESTNET_SERVER_SSH_KEY" ;;
    secondary) expand_path "$QUBITOR_TESTNET_BOOTNODE_2_SSH_KEY" ;;
    *) fail "unknown target: $1" ;;
  esac
}

target_password() {
  case "$1" in
    primary) printf '%s' "${QUBITOR_TESTNET_SERVER_PASSWORD:-}" ;;
    secondary) printf '%s' "${QUBITOR_TESTNET_BOOTNODE_2_PASSWORD:-}" ;;
    *) fail "unknown target: $1" ;;
  esac
}

target_list() {
  local requested="${1:-all}"
  case "$requested" in
    all) printf '%s\n' primary secondary ;;
    primary|secondary) printf '%s\n' "$requested" ;;
    *) fail "target must be primary, secondary, or all" ;;
  esac
}

ssh_base_options() {
  local target="$1"
  local -n out="$2"
  local key_file
  key_file="$(target_key "$target")"
  out=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -p "$(target_port "$target")")
  if [[ -n "$key_file" && -f "$key_file" ]]; then
    out+=(-i "$key_file")
  fi
}

ssh_run_target() {
  local target="$1"
  local command="$2"
  local opts=()
  local user host password
  user="$(target_user "$target")"
  host="$(target_host "$target")"
  password="$(target_password "$target")"
  ssh_base_options "$target" opts

  if ssh -n -o BatchMode=yes "${opts[@]}" "$user@$host" "$command" 2>"/tmp/qubitor-${target}-ssh-key.err"; then
    return 0
  fi
  if [[ -z "$password" ]]; then
    cat "/tmp/qubitor-${target}-ssh-key.err" >&2 || true
    return 1
  fi
  command -v sshpass >/dev/null 2>&1 || fail "sshpass is required for password fallback to $host"
  SSHPASS="$password" sshpass -e ssh -n -o PubkeyAuthentication=no "${opts[@]}" "$user@$host" "$command"
}

rsync_to_target() {
  local target="$1"
  local source="$2"
  local destination="$3"
  local key_file user host password ssh_cmd
  key_file="$(target_key "$target")"
  user="$(target_user "$target")"
  host="$(target_host "$target")"
  password="$(target_password "$target")"
  ssh_cmd="ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -p $(target_port "$target")"
  if [[ -n "$key_file" && -f "$key_file" ]]; then
    ssh_cmd="$ssh_cmd -i $key_file"
  fi

  if rsync -az -e "$ssh_cmd" "$source" "$user@$host:$destination" 2>"/tmp/qubitor-${target}-rsync-key.err"; then
    return 0
  fi
  if [[ -z "$password" ]]; then
    cat "/tmp/qubitor-${target}-rsync-key.err" >&2 || true
    return 1
  fi
  command -v sshpass >/dev/null 2>&1 || fail "sshpass is required for password fallback to $host"
  SSHPASS="$password" sshpass -e rsync -az -e "$ssh_cmd -o PubkeyAuthentication=no" "$source" "$user@$host:$destination"
}

rsync_from_target() {
  local target="$1"
  local source="$2"
  local destination="$3"
  local key_file user host password ssh_cmd
  key_file="$(target_key "$target")"
  user="$(target_user "$target")"
  host="$(target_host "$target")"
  password="$(target_password "$target")"
  ssh_cmd="ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -p $(target_port "$target")"
  if [[ -n "$key_file" && -f "$key_file" ]]; then
    ssh_cmd="$ssh_cmd -i $key_file"
  fi

  if rsync -az -e "$ssh_cmd" "$user@$host:$source" "$destination" 2>"/tmp/qubitor-${target}-rsync-from-key.err"; then
    return 0
  fi
  if [[ -z "$password" ]]; then
    cat "/tmp/qubitor-${target}-rsync-from-key.err" >&2 || true
    return 1
  fi
  command -v sshpass >/dev/null 2>&1 || fail "sshpass is required for password fallback to $host"
  SSHPASS="$password" sshpass -e rsync -az -e "$ssh_cmd -o PubkeyAuthentication=no" "$user@$host:$source" "$destination"
}

rsync_repo_to_target() {
  local target="$1"
  local key_file user host password ssh_cmd
  key_file="$(target_key "$target")"
  user="$(target_user "$target")"
  host="$(target_host "$target")"
  password="$(target_password "$target")"
  ssh_cmd="ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -p $(target_port "$target")"
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
    --exclude .next
    --exclude dist
    --exclude build
    --exclude artifacts/testnet/launch
    --exclude artifacts/testnet/server-snapshots
    --exclude .env
    --exclude .env.local
    --exclude .env.testnet
    --exclude .env.testnet.local
    --exclude infra/.env.discord.local
  )

  if rsync -az "${excludes[@]}" -e "$ssh_cmd" "$ROOT_DIR/" "$user@$host:$REMOTE_ROOT/" 2>"/tmp/qubitor-${target}-repo-rsync-key.err"; then
    return 0
  fi
  if [[ -z "$password" ]]; then
    cat "/tmp/qubitor-${target}-repo-rsync-key.err" >&2 || true
    return 1
  fi
  command -v sshpass >/dev/null 2>&1 || fail "sshpass is required for password fallback to $host"
  SSHPASS="$password" sshpass -e rsync -az "${excludes[@]}" -e "$ssh_cmd -o PubkeyAuthentication=no" "$ROOT_DIR/" "$user@$host:$REMOTE_ROOT/"
}
