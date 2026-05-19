#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAIM="Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts."

fail() {
  echo "[qubitor-admin-controls] $*" >&2
  exit 1
}

require_file() {
  local file="$1"
  [[ -f "$file" ]] || fail "missing file: ${file#$ROOT_DIR/}"
}

require_contains() {
  local file="$1"
  local pattern="$2"
  grep -Fq "$pattern" "$file" || fail "${file#$ROOT_DIR/} must contain: $pattern"
}

reject_contains() {
  local file="$1"
  local pattern="$2"
  if grep -Fq "$pattern" "$file"; then
    fail "${file#$ROOT_DIR/} must not contain: $pattern"
  fi
}

reject_contract_pattern() {
  local pattern="$1"
  if rg -n "$pattern" "$ROOT_DIR/contracts/src" >/tmp/qubitor-admin-contract-match.txt; then
    cat /tmp/qubitor-admin-contract-match.txt >&2
    fail "contracts/src must not contain admin/upgradability pattern: $pattern"
  fi
}

ADMIN_DOC="$ROOT_DIR/docs/security/admin-control-inventory.md"
CHAIN_CONFIG="$ROOT_DIR/packages/chain-config/src/index.ts"
CHAIN_CONFIG_TEST="$ROOT_DIR/packages/chain-config/src/index.test.ts"
FAUCET="$ROOT_DIR/services/faucet-api/src/index.ts"
PQ_RELAYER="$ROOT_DIR/services/pq-relayer-api/src/index.ts"
DEPLOY_SCRIPT="$ROOT_DIR/scripts/devnet/deploy-contracts.sh"
PQ_ADMIN_SMOKE="$ROOT_DIR/scripts/devnet/pq-admin-smoke.sh"
PQ_ADMIN_VAULT="$ROOT_DIR/contracts/src/QubitorAdminVault.sol"
ENV_EXAMPLE="$ROOT_DIR/.env.example"

for file in \
  "$ADMIN_DOC" \
  "$CHAIN_CONFIG" \
  "$CHAIN_CONFIG_TEST" \
  "$FAUCET" \
  "$PQ_RELAYER" \
  "$DEPLOY_SCRIPT" \
  "$PQ_ADMIN_SMOKE" \
  "$PQ_ADMIN_VAULT" \
  "$ENV_EXAMPLE"; do
  require_file "$file"
done

for file in "$ADMIN_DOC" "$ENV_EXAMPLE"; do
  require_contains "$file" "QUBITOR_DEPLOYER_PRIVATE_KEY"
  require_contains "$file" "QUBITOR_FAUCET_PRIVATE_KEY"
  require_contains "$file" "QUBITOR_PQ_RELAYER_PRIVATE_KEY"
done

require_contains "$ADMIN_DOC" "$CLAIM"
require_contains "$ADMIN_DOC" "Genesis system contract installer"
require_contains "$ADMIN_DOC" "no EOA deployer"
require_contains "$ADMIN_DOC" "Future PQ Policy"
require_contains "$ADMIN_DOC" "No privileged production admin control is deployed"
require_contains "$ADMIN_DOC" "QubitorAdminVault"
require_contains "$ADMIN_DOC" "pnpm admin:acceptance"

require_contains "$CHAIN_CONFIG" "qubitorAdminControlSurfaces"
require_contains "$CHAIN_CONFIG" "QUBITOR_DEVNET_COMPAT_PRIVATE_KEYS"
require_contains "$CHAIN_CONFIG" "QUBITOR_DEVNET_DEPLOYER_PRIVATE_KEY"
require_contains "$CHAIN_CONFIG" "QUBITOR_DEVNET_FAUCET_PRIVATE_KEY"
require_contains "$CHAIN_CONFIG" "QUBITOR_DEVNET_RELAYER_PRIVATE_KEY"
require_contains "$CHAIN_CONFIG" "QUBITOR_FAUCET_PQ_SEED"
require_contains "$CHAIN_CONFIG" "assertDevnetCompatibilityKey"
require_contains "$CHAIN_CONFIG" "isLocalRpcUrl"
require_contains "$CHAIN_CONFIG" "protocolAdminAuthority"
require_contains "$CHAIN_CONFIG" "pq-admin-simulator"
require_contains "$CHAIN_CONFIG" "pq-faucet-treasury-topup"

require_contains "$CHAIN_CONFIG_TEST" "refusing known deterministic devnet key"
require_contains "$FAUCET" "QUBITOR_FAUCET_PQ_SEED"
require_contains "$FAUCET" "controlSurface: \"pq-native-faucet-treasury\""
require_contains "$FAUCET" "PQ Native"
require_contains "$FAUCET" "Native QubitorPQTxV1 ML-DSA-65 authorization"
require_contains "$FAUCET" "sendRawQubitorPQTxV1"
require_contains "$FAUCET" "treasuryControl"
require_contains "$FAUCET" "QUBITOR_FAUCET_TREASURY_MODE"
require_contains "$FAUCET" "QUBITOR_FAUCET_TREASURY_VAULT"
reject_contains "$FAUCET" "privateKeyToAccount"
require_contains "$PQ_RELAYER" "sendRawQubitorPQTxV1"
require_contains "$PQ_RELAYER" "controlSurface: \"pq-native-raw-transaction-gateway\""
require_contains "$PQ_RELAYER" "legacyGasPayer: false"
reject_contains "$PQ_RELAYER" "privateKeyToAccount"
reject_contains "$PQ_RELAYER" "createWalletClient"
require_contains "$DEPLOY_SCRIPT" "QUBITOR_DEPLOYER_PRIVATE_KEY is ignored and prohibited"
require_contains "$DEPLOY_SCRIPT" "installing canonical system contracts into genesis"
require_contains "$PQ_ADMIN_SMOKE" "QubitorAdminVault"
require_contains "$PQ_ADMIN_SMOKE" "faucet/status"
require_contains "$PQ_ADMIN_SMOKE" "faucet/request"
require_contains "$PQ_ADMIN_SMOKE" "top up faucet hot wallet"
require_contains "$PQ_ADMIN_SMOKE" "requesting faucet QBT after PQ treasury top-up"
require_contains "$PQ_ADMIN_SMOKE" "recordPolicy(bytes32,bytes32)"
require_contains "$PQ_ADMIN_SMOKE" "transferTreasury(address,uint256)"
require_contains "$PQ_ADMIN_SMOKE" "executePQ(address,uint256,bytes,uint256,bytes)"
require_contains "$PQ_ADMIN_SMOKE" "expected Legacy EOA policy call to revert"
require_contains "$PQ_ADMIN_VAULT" "pqController"
require_contains "$PQ_ADMIN_VAULT" "onlyPQController"
require_contains "$PQ_ADMIN_VAULT" "recordPolicy"
require_contains "$PQ_ADMIN_VAULT" "transferTreasury"
require_contains "$ENV_EXAMPLE" "Services and deploy scripts refuse these keys against non-local RPC URLs."

reject_contract_pattern "onlyOwner"
reject_contract_pattern "Ownable"
reject_contract_pattern "DEFAULT_ADMIN_ROLE"
reject_contract_pattern "AccessControl"
reject_contract_pattern "upgradeTo"
reject_contract_pattern "upgradeToAndCall"
reject_contract_pattern "TransparentUpgradeableProxy"
reject_contract_pattern "UUPSUpgradeable"
reject_contract_pattern "delegatecall"
reject_contract_pattern "selfdestruct"

echo "[qubitor-admin-controls] ok"
