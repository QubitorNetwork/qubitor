#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DRY_RUN=0
OTP="${NPM_CONFIG_OTP:-}"
TOKEN="${NPM_TOKEN:-${NODE_AUTH_TOKEN:-}}"
TEMP_NPMRC=""

log() {
  printf '[qubitor-npm] %s\n' "$*"
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --otp)
      OTP="${2:-}"
      if [[ -z "${OTP}" ]]; then
        log "--otp requires a value"
        exit 1
      fi
      shift 2
      ;;
    *)
      log "unknown argument: $1"
      exit 1
      ;;
  esac
done

PACKAGES=(
  "packages/chain-config"
  "packages/pq-native-tx"
  "packages/sdk"
)

cleanup() {
  if [[ -n "${TEMP_NPMRC}" && -f "${TEMP_NPMRC}" ]]; then
    rm -f "${TEMP_NPMRC}"
  fi
}
trap cleanup EXIT

if [[ "${DRY_RUN}" == "0" ]]; then
  if [[ -n "${TOKEN}" ]]; then
    TEMP_NPMRC="$(mktemp)"
    {
      printf 'registry=https://registry.npmjs.org/\n'
      printf '//registry.npmjs.org/:_authToken=%s\n' "${TOKEN}"
    } >"${TEMP_NPMRC}"
    export NPM_CONFIG_USERCONFIG="${TEMP_NPMRC}"
  fi

  if ! npm whoami >/dev/null 2>&1; then
    log "npm authentication is missing or invalid."
    log "Run npm login, or set a valid NPM_TOKEN/NODE_AUTH_TOKEN for an account with access to the @qubitor scope."
    exit 1
  fi
fi

log "building SDK package stack"
pnpm --dir "${ROOT_DIR}" --filter @qubitor/chain-config build
pnpm --dir "${ROOT_DIR}" --filter @qubitor/pq-native-tx build
pnpm --dir "${ROOT_DIR}" --filter @qubitor/sdk build

log "typechecking SDK package stack"
pnpm --dir "${ROOT_DIR}" --filter @qubitor/chain-config typecheck
pnpm --dir "${ROOT_DIR}" --filter @qubitor/pq-native-tx typecheck
pnpm --dir "${ROOT_DIR}" --filter @qubitor/sdk typecheck

log "testing SDK package stack"
pnpm --dir "${ROOT_DIR}" --filter @qubitor/chain-config test
pnpm --dir "${ROOT_DIR}" --filter @qubitor/pq-native-tx test
pnpm --dir "${ROOT_DIR}" --filter @qubitor/sdk test

if [[ "${DRY_RUN}" == "1" ]]; then
  PACK_DIR="/tmp/qubitor-npm-pack-check"
  rm -rf "${PACK_DIR}"
  mkdir -p "${PACK_DIR}"

  for package_path in "${PACKAGES[@]}"; do
    log "packing ${package_path}"
    pnpm --dir "${ROOT_DIR}/${package_path}" pack --pack-destination "${PACK_DIR}"
  done

  log "dry-run complete; tarballs are in ${PACK_DIR}"
  exit 0
fi

for package_path in "${PACKAGES[@]}"; do
  log "publishing ${package_path}"
  (
    cd "${ROOT_DIR}/${package_path}"
    publish_args=(publish --access public --no-git-checks)
    if [[ -n "${OTP}" ]]; then
      publish_args+=(--otp "${OTP}")
    fi
    pnpm "${publish_args[@]}"
  )
done

log "published @qubitor/chain-config, @qubitor/pq-native-tx, and @qubitor/sdk"
