#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  echo "[qubitor-pq-native] $*" >&2
  exit 1
}

require_file() {
  local file="$1"
  [[ -f "$file" ]] || fail "missing file: ${file#$ROOT_DIR/}"
}

require_contains() {
  local file="$1"
  local pattern="$2"
  grep -Fq -- "$pattern" "$file" || fail "${file#$ROOT_DIR/} must contain: $pattern"
}

ARCH="$ROOT_DIR/docs/architecture/pq-native-transaction-layer.md"
OVERVIEW="$ROOT_DIR/docs/architecture/overview.md"
ADMIN="$ROOT_DIR/docs/security/admin-control-inventory.md"
THREAT="$ROOT_DIR/docs/security/threat-model.md"
COVERAGE="$ROOT_DIR/docs/quantum-readiness/coverage-matrix.md"
TESTNET="$ROOT_DIR/docs/testnet/readiness.md"
README="$ROOT_DIR/README.md"
PACKAGE="$ROOT_DIR/package.json"
DEVNET_GENESIS="$ROOT_DIR/clients/qubitor-node/config/devnet/genesis.json"
RAW_SMOKE="$ROOT_DIR/scripts/devnet/pq-native-raw-tx-smoke.sh"

for file in "$ARCH" "$OVERVIEW" "$ADMIN" "$THREAT" "$COVERAGE" "$TESTNET" "$README" "$PACKAGE" "$DEVNET_GENESIS" "$RAW_SMOKE"; do
  require_file "$file"
done

require_contains "$PACKAGE" "\"pq-native:acceptance\""

for file in "$ARCH" "$OVERVIEW" "$ADMIN" "$TESTNET" "$README"; do
  require_contains "$file" "No EOA anywhere"
  require_contains "$file" "Qubitor wallet address"
  require_contains "$file" "Qubitor-native"
done

require_contains "$ARCH" "QubitorPQTxV1"
require_contains "$ARCH" 'CoreGeth now reserves typed transaction `0x04` as `QubitorPQTxType`'
require_contains "$ARCH" "CoreGeth sender derivation verifies the ML-DSA signature"
require_contains "$ARCH" "canonical QubitorAccountFactory CREATE2 address"
require_contains "$ARCH" 'wallet now produces raw `QubitorPQTxV1` bytes'
require_contains "$ARCH" "cross-repo fixture test checks the wallet signing hash"
require_contains "$ARCH" "qubitor_sendRawPQTransaction"
require_contains "$ARCH" "pnpm devnet:pq-native-raw-smoke"
require_contains "$ARCH" "legacy Ethereum transaction types"
require_contains "$ARCH" 'reject legacy Ethereum transaction types once `QUBITOR_EOA_TXS=0`'
require_contains "$ARCH" "Gas is charged to the Qubitor Account balance"
require_contains "$ARCH" 'miner `etherbase` is only a reward recipient'
require_contains "$ARCH" "No service owns a gas-payer EOA"
require_contains "$ARCH" "genesis file installs"

for file in "$ADMIN" "$TESTNET"; do
  require_contains "$file" 'QUBITOR_DEPLOYER_PRIVATE_KEY` is prohibited for Qubitor-native launch'
  require_contains "$file" 'QUBITOR_FAUCET_PRIVATE_KEY` is prohibited for Qubitor-native launch'
  require_contains "$file" 'QUBITOR_PQ_RELAYER_PRIVATE_KEY` is prohibited for Qubitor-native launch'
  require_contains "$file" 'QUBITOR_MINER_PRIVATE_KEY` is prohibited for Qubitor-native launch'
done

require_contains "$THREAT" "faucet grants/raw submission no longer require relayer/faucet/deployer EOA gas keys"
require_contains "$THREAT" "legacy Ethereum transaction types are disabled"
require_contains "$COVERAGE" "PQ-native transaction layer"
require_contains "$COVERAGE" "No EOA anywhere"
require_contains "$PACKAGE" "devnet:pq-native-raw-smoke"
require_contains "$PACKAGE" "devnet:soak"
require_contains "$PACKAGE" "devnet:multinode-smoke"
require_contains "$DEVNET_GENESIS" "587292b9914d42fb8708ba2108e846609ba23d89"
require_contains "$DEVNET_GENESIS" "0000000000000000000000000000000000000203"
require_contains "$RAW_SMOKE" "qubitor_sendRawPQTransaction"
require_contains "$RAW_SMOKE" "deriveQubitorPQAccountAddress"

echo "[qubitor-pq-native] ok"
