#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/server-access-lib.sh"

usage() {
  cat >&2 <<'EOF'
usage: pnpm testnet:ops-code:<sync|restart-explorer|restart-rpc|deploy|deploy-rpc-hardening> [primary|secondary|all]

Syncs non-secret repo code to testnet servers and optionally restarts Explorer Lite.
EOF
}

run_deploy_safety() {
  echo "[qubitor-testnet-ops] running no-reset deploy safety gate"
  bash "$ROOT_DIR/scripts/testnet/deploy-safety.sh"
}

sync_code() {
  local target="$1"
  echo "[qubitor-testnet-ops] syncing repo code to $target ($(target_host "$target"))"
  rsync_repo_to_target "$target"
}

restart_explorer() {
  local target="$1"
  echo "[qubitor-testnet-ops] restarting explorer-lite on $target ($(target_host "$target"))"
  ssh_run_target "$target" "container=\$(docker ps --format '{{.Names}}' | grep -E 'explorer-lite' | head -n 1 || true); if [ -z \"\$container\" ]; then echo 'explorer-lite container not running; skipping restart'; exit 0; fi; docker restart \"\$container\""
}

restart_rpc_gateway() {
  local target="$1"
  echo "[qubitor-testnet-ops] restarting rpc-gateway/public-gateway on $target ($(target_host "$target"))"
  ssh_run_target "$target" "containers=\$(docker ps --format '{{.Names}}' | grep -E '(rpc-gateway|public-gateway)' || true); if [ -z \"\$containers\" ]; then echo 'rpc-gateway/public-gateway containers not running; skipping restart'; exit 0; fi; printf '%s\n' \"\$containers\" | xargs docker restart"
}

ACTION="${1:-}"
TARGET="${2:-all}"
if [[ -z "$ACTION" || "$ACTION" == "-h" || "$ACTION" == "--help" ]]; then
  usage
  exit 0
fi

load_testnet_access_env

case "$ACTION" in
  sync)
    while read -r target; do sync_code "$target"; done < <(target_list "$TARGET")
    ;;
  restart-explorer)
    run_deploy_safety
    while read -r target; do restart_explorer "$target"; done < <(target_list "$TARGET")
    ;;
  restart-rpc)
    run_deploy_safety
    while read -r target; do restart_rpc_gateway "$target"; done < <(target_list "$TARGET")
    ;;
  deploy)
    run_deploy_safety
    while read -r target; do sync_code "$target"; restart_explorer "$target"; done < <(target_list "$TARGET")
    ;;
  deploy-rpc-hardening)
    run_deploy_safety
    while read -r target; do sync_code "$target"; restart_rpc_gateway "$target"; done < <(target_list "$TARGET")
    ;;
  *)
    usage
    exit 1
    ;;
esac
