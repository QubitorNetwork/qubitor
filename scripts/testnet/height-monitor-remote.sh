#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/server-access-lib.sh"

usage() {
  cat >&2 <<'EOF'
usage: pnpm testnet:height-monitor:<run|status|install-cron> [primary|secondary|all]

Installs or runs the block-height/genesis monitor on Qubitor testnet servers.
EOF
}

sync_monitor_script() {
  local target="$1"
  ssh_run_target "$target" "mkdir -p $(shell_quote "$REMOTE_ROOT/scripts/testnet")"
  rsync_to_target "$target" "$ROOT_DIR/scripts/testnet/height-monitor.sh" "$REMOTE_ROOT/scripts/testnet/height-monitor.sh"
}

run_monitor() {
  local target="$1"
  echo "[qubitor-height-monitor] running on $target ($(target_host "$target"))"
  sync_monitor_script "$target"
  ssh_run_target "$target" "cd $(shell_quote "$REMOTE_ROOT") && bash scripts/testnet/height-monitor.sh"
}

status_monitor() {
  local target="$1"
  echo "[qubitor-height-monitor] status for $target ($(target_host "$target"))"
  ssh_run_target "$target" "cd $(shell_quote "$REMOTE_ROOT") && { cat data/monitor/testnet-height.state 2>/dev/null || true; tail -20 data/monitor/testnet-height-alerts.log 2>/dev/null || true; }"
}

install_monitor_cron() {
  local target="$1"
  echo "[qubitor-height-monitor] installing minute cron on $target ($(target_host "$target"))"
  sync_monitor_script "$target"
  ssh_run_target "$target" "mkdir -p $(shell_quote "$REMOTE_ROOT/logs") && cat >/etc/cron.d/qubitor-testnet-height-monitor <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * root cd /root/QubitorNetwork && bash scripts/testnet/height-monitor.sh >> logs/testnet-height-monitor.log 2>&1
EOF
chmod 0644 /etc/cron.d/qubitor-testnet-height-monitor"
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
    while read -r target; do run_monitor "$target"; done < <(target_list "$TARGET")
    ;;
  status)
    while read -r target; do status_monitor "$target"; done < <(target_list "$TARGET")
    ;;
  install-cron)
    while read -r target; do install_monitor_cron "$target"; done < <(target_list "$TARGET")
    ;;
  *)
    usage
    exit 1
    ;;
esac
