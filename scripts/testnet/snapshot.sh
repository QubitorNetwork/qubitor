#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/server-access-lib.sh"

usage() {
  cat >&2 <<'EOF'
usage: pnpm testnet:snapshot:<run|status|install-cron|pull> [primary|secondary|all]

Creates chain and bridge-state snapshots on the Qubitor testnet servers.
EOF
}

sync_snapshot_script() {
  local target="$1"
  ssh_run_target "$target" "mkdir -p $(shell_quote "$REMOTE_ROOT/scripts/testnet")"
  rsync_to_target "$target" "$ROOT_DIR/scripts/testnet/local-snapshot.sh" "$REMOTE_ROOT/scripts/testnet/local-snapshot.sh"
}

run_snapshot() {
  local target="$1"
  echo "[qubitor-testnet-snapshot] running on $target ($(target_host "$target"))"
  sync_snapshot_script "$target"
  ssh_run_target "$target" "cd $(shell_quote "$REMOTE_ROOT") && bash scripts/testnet/local-snapshot.sh"
}

status_snapshot() {
  local target="$1"
  echo "[qubitor-testnet-snapshot] status for $target ($(target_host "$target"))"
  ssh_run_target "$target" "cd $(shell_quote "$REMOTE_ROOT") && find backups/testnet-snapshots -mindepth 2 -maxdepth 2 -type d -printf '%TY-%Tm-%Td %TH:%TM %p\n' 2>/dev/null | sort -r | head -10 || true"
}

install_snapshot_cron() {
  local target="$1"
  echo "[qubitor-testnet-snapshot] installing daily cron on $target ($(target_host "$target"))"
  sync_snapshot_script "$target"
  ssh_run_target "$target" "mkdir -p $(shell_quote "$REMOTE_ROOT/logs") && cat >/etc/cron.d/qubitor-testnet-snapshot <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 3 * * * root cd /root/QubitorNetwork && bash scripts/testnet/local-snapshot.sh >> logs/testnet-snapshot.log 2>&1
EOF
chmod 0644 /etc/cron.d/qubitor-testnet-snapshot"
}

pull_snapshots() {
  local target="$1"
  local host
  host="$(target_host "$target")"
  local dest="$ROOT_DIR/artifacts/testnet/server-snapshots/$host/"
  mkdir -p "$dest"
  echo "[qubitor-testnet-snapshot] pulling snapshots from $target ($host)"
  rsync_from_target "$target" "$REMOTE_ROOT/backups/testnet-snapshots/" "$dest"
}

ACTION="${1:-}"
TARGET="${2:-all}"
if [[ -z "$ACTION" || "$ACTION" == "-h" || "$ACTION" == "--help" ]]; then
  usage
  exit 0
fi

load_testnet_access_env

case "$ACTION" in
  run)
    while read -r target; do run_snapshot "$target"; done < <(target_list "$TARGET")
    ;;
  status)
    while read -r target; do status_snapshot "$target"; done < <(target_list "$TARGET")
    ;;
  install-cron)
    while read -r target; do install_snapshot_cron "$target"; done < <(target_list "$TARGET")
    ;;
  pull)
    while read -r target; do pull_snapshots "$target"; done < <(target_list "$TARGET")
    ;;
  *)
    usage
    exit 1
    ;;
esac
