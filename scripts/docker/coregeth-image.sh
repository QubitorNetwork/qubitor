#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COREGETH_DIR="$ROOT_DIR/clients/qubitor-node/coregeth"
IMAGE_REPOSITORY="${QUBITOR_COREGETH_IMAGE_REPOSITORY:-qubitororg/qubitor-geth}"
PLATFORM="${QUBITOR_COREGETH_DOCKER_PLATFORM:-linux/amd64}"
ACTION="${1:-build}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[qubitor-coregeth-image] docker is required" >&2
  exit 1
fi

COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD)"
SHORT_SHA="$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD)"
VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"

build_args=(
  --platform "$PLATFORM"
  --file "$COREGETH_DIR/Dockerfile"
  --build-arg "COMMIT=$COMMIT"
  --build-arg "VERSION=$VERSION"
  "$COREGETH_DIR"
)

has_buildx=0
if docker buildx version >/dev/null 2>&1; then
  has_buildx=1
fi

case "$ACTION" in
  build)
    echo "[qubitor-coregeth-image] building $IMAGE_REPOSITORY:testnet-local for $PLATFORM"
    if [[ "$has_buildx" == "1" ]]; then
      docker buildx build \
        "${build_args[@]}" \
        --load \
        --tag "$IMAGE_REPOSITORY:testnet-local" \
        --tag "$IMAGE_REPOSITORY:testnet-$SHORT_SHA-local"
    else
      docker build \
        "${build_args[@]}" \
        --tag "$IMAGE_REPOSITORY:testnet-local" \
        --tag "$IMAGE_REPOSITORY:testnet-$SHORT_SHA-local"
    fi
    ;;
  publish-testnet)
    if [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" && "${QUBITOR_COREGETH_ALLOW_DIRTY_PUBLISH:-0}" != "1" ]]; then
      echo "[qubitor-coregeth-image] refusing to publish from a dirty tree; commit first or set QUBITOR_COREGETH_ALLOW_DIRTY_PUBLISH=1" >&2
      exit 1
    fi
    echo "[qubitor-coregeth-image] publishing $IMAGE_REPOSITORY:testnet and $IMAGE_REPOSITORY:testnet-$SHORT_SHA for $PLATFORM"
    if [[ "$has_buildx" == "1" ]]; then
      docker buildx build \
        "${build_args[@]}" \
        --push \
        --tag "$IMAGE_REPOSITORY:testnet" \
        --tag "$IMAGE_REPOSITORY:testnet-$SHORT_SHA"
    else
      docker build \
        "${build_args[@]}" \
        --tag "$IMAGE_REPOSITORY:testnet" \
        --tag "$IMAGE_REPOSITORY:testnet-$SHORT_SHA"
      docker push "$IMAGE_REPOSITORY:testnet"
      docker push "$IMAGE_REPOSITORY:testnet-$SHORT_SHA"
    fi
    ;;
  *)
    echo "usage: $0 [build|publish-testnet]" >&2
    exit 2
    ;;
esac
