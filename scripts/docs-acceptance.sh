#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAIM="Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts."

fail() {
  echo "[qubitor-docs] $*" >&2
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
    fail "${file#$ROOT_DIR/} must not contain stale text: $pattern"
  fi
}

THREAT_MODEL="$ROOT_DIR/docs/security/threat-model.md"
COVERAGE_MATRIX="$ROOT_DIR/docs/quantum-readiness/coverage-matrix.md"
ADMIN_CONTROL_INVENTORY="$ROOT_DIR/docs/security/admin-control-inventory.md"
ARCHITECTURE="$ROOT_DIR/docs/architecture/overview.md"
TESTNET_READINESS="$ROOT_DIR/docs/testnet/readiness.md"
TESTNET_LAUNCH_MATERIAL="$ROOT_DIR/docs/testnet/launch-material.md"
SPHINCS_MINUS_TRACK="$ROOT_DIR/docs/quantum-readiness/sphincs-minus-track.md"
PQ_NATIVE_ARCHITECTURE="$ROOT_DIR/docs/architecture/pq-native-transaction-layer.md"
ACCOUNT_CONTRACT="$ROOT_DIR/contracts/src/QubitorAccount.sol"
SECURITY_REGISTRY="$ROOT_DIR/contracts/src/SecurityModeRegistry.sol"
READINESS_REGISTRY="$ROOT_DIR/contracts/src/AccountReadinessRegistry.sol"
ACCEPTANCE_SCRIPT="$ROOT_DIR/scripts/devnet/acceptance.sh"
EXPLORER_SMOKE="$ROOT_DIR/scripts/devnet/explorer-smoke.sh"
PROOF_PACK="$ROOT_DIR/scripts/devnet/proof-pack.sh"
PROOF_VERIFIER="$ROOT_DIR/packages/proof-verifier/src/index.ts"

for file in \
  "$THREAT_MODEL" \
  "$COVERAGE_MATRIX" \
  "$ADMIN_CONTROL_INVENTORY" \
  "$ARCHITECTURE" \
  "$TESTNET_READINESS" \
  "$TESTNET_LAUNCH_MATERIAL" \
  "$SPHINCS_MINUS_TRACK" \
  "$PQ_NATIVE_ARCHITECTURE" \
  "$ACCOUNT_CONTRACT" \
  "$SECURITY_REGISTRY" \
  "$READINESS_REGISTRY" \
  "$ACCEPTANCE_SCRIPT" \
  "$EXPLORER_SMOKE" \
  "$PROOF_PACK" \
  "$PROOF_VERIFIER"; do
  require_file "$file"
done

for file in "$THREAT_MODEL" "$COVERAGE_MATRIX"; do
  require_contains "$file" "$CLAIM"
  require_contains "$file" "ML-DSA-65"
  require_contains "$file" "SLH-DSA"
  require_contains "$file" "FIPS 204"
  require_contains "$file" "FIPS 205"
  require_contains "$file" "0x0000000000000000000000000000000000000100"
  require_contains "$file" "Legacy EOA"
  require_contains "$file" "deployer"
  require_contains "$file" "faucet"
  require_contains "$file" "relayer"
  require_contains "$file" "QUBITOR_EOA_TXS=0"
  require_contains "$file" "impossible"
  require_contains "$file" "forever quantum-proof"
  require_contains "$file" "pnpm devnet:acceptance"
  require_contains "$file" "pnpm coregeth:test"
  require_contains "$file" "pnpm contracts:test"
  reject_contains "$file" "client adapter pending"
  reject_contains "$file" "Pending wallet integration"
done

require_contains "$ADMIN_CONTROL_INVENTORY" "$CLAIM"
require_contains "$ADMIN_CONTROL_INVENTORY" "QUBITOR_DEPLOYER_PRIVATE_KEY"
require_contains "$ADMIN_CONTROL_INVENTORY" "QUBITOR_FAUCET_PRIVATE_KEY"
require_contains "$ADMIN_CONTROL_INVENTORY" "QUBITOR_PQ_RELAYER_PRIVATE_KEY"
require_contains "$ADMIN_CONTROL_INVENTORY" "Genesis system contract installer"
require_contains "$ADMIN_CONTROL_INVENTORY" "Future PQ Policy"
require_contains "$ADMIN_CONTROL_INVENTORY" "pnpm admin:acceptance"

require_contains "$TESTNET_READINESS" "$CLAIM"
require_contains "$TESTNET_READINESS" "pnpm testnet:readiness"
require_contains "$TESTNET_READINESS" "pnpm testnet:material:generate"
require_contains "$TESTNET_READINESS" "pnpm testnet:launch-preflight"
require_contains "$TESTNET_READINESS" "QUBITOR_NETWORK"
require_contains "$TESTNET_READINESS" "Docker Compose uses the local Qubitor CoreGeth fork"
require_contains "$TESTNET_READINESS" "clients/qubitor-node/config/testnet/genesis.json"
require_contains "$TESTNET_READINESS" "public testnet chain ID"
require_contains "$TESTNET_READINESS" "verified proof pack"
require_contains "$TESTNET_READINESS" "Qubitor Account or stricter PQ policy"
require_contains "$TESTNET_READINESS" "No EOA anywhere"
require_contains "$TESTNET_READINESS" "Qubitor wallet address"
require_contains "$TESTNET_LAUNCH_MATERIAL" "pnpm testnet:material:generate"
require_contains "$TESTNET_LAUNCH_MATERIAL" "artifacts/testnet/launch/<timestamp>/"
require_contains "$TESTNET_LAUNCH_MATERIAL" "QUBITOR_TESTNET_ENV_FILE"
require_contains "$TESTNET_LAUNCH_MATERIAL" "QUBITOR_TESTNET_SERVER_ENV_FILE"
require_contains "$TESTNET_LAUNCH_MATERIAL" "QUBITOR_NETWORK=testnet"
require_contains "$TESTNET_LAUNCH_MATERIAL" "QUBITOR_BOOTNODE_PUBLIC_HOSTS"
require_contains "$TESTNET_LAUNCH_MATERIAL" "QUBITOR_BOOTNODE_MIN_COUNT"
require_contains "$TESTNET_LAUNCH_MATERIAL" "QUBITOR_P2P_TCP_PORT"
require_contains "$TESTNET_LAUNCH_MATERIAL" "Dedicated Ubuntu Server"
require_contains "$TESTNET_LAUNCH_MATERIAL" "sudo ufw allow 30303/tcp"

require_contains "$SPHINCS_MINUS_TRACK" "https://github.com/vbuterin/sphincsminus"
require_contains "$SPHINCS_MINUS_TRACK" "https://github.com/Quantx256hash/sphincsminus"
require_contains "$SPHINCS_MINUS_TRACK" "third_party/sphincsminus"
require_contains "$SPHINCS_MINUS_TRACK" "Research only"
require_contains "$SPHINCS_MINUS_TRACK" "not part of Qubitor consensus"
require_contains "$SPHINCS_MINUS_TRACK" "not a default wallet signing mode"
require_contains "$SPHINCS_MINUS_TRACK" "pnpm research:sphincs-minus:smoke"
require_contains "$SPHINCS_MINUS_TRACK" "SLH-DSA/FIPS 205"

require_contains "$ARCHITECTURE" "Current Devnet Registration"
require_contains "$ARCHITECTURE" "No EOA anywhere"
require_contains "$ARCHITECTURE" "docs/architecture/pq-native-transaction-layer.md"
require_contains "$ARCHITECTURE" "clients/qubitor-node/coregeth/core/vm/contracts_qubitor.go"
require_contains "$ARCHITECTURE" "third_party/sphincsminus"
require_contains "$ARCHITECTURE" "pnpm research:sphincs-minus:smoke"
require_contains "$ARCHITECTURE" "pnpm coregeth:test"
require_contains "$ARCHITECTURE" "pnpm devnet:acceptance"
reject_contains "$ARCHITECTURE" "Current Integration Gap"
reject_contains "$ARCHITECTURE" "still needs a thin adapter"

require_contains "$PQ_NATIVE_ARCHITECTURE" "No EOA anywhere"
require_contains "$PQ_NATIVE_ARCHITECTURE" "QubitorPQTxV1"
require_contains "$PQ_NATIVE_ARCHITECTURE" "legacy Ethereum transaction types"
require_contains "$PQ_NATIVE_ARCHITECTURE" "Qubitor wallet address"

require_contains "$ACCOUNT_CONTRACT" "executePQ"
require_contains "$ACCOUNT_CONTRACT" "rotatePQKey"
require_contains "$ACCOUNT_CONTRACT" "block.chainid"
require_contains "$ACCOUNT_CONTRACT" "address(this)"
require_contains "$ACCOUNT_CONTRACT" "MLDSA65_PRECOMPILE"
reject_contains "$ACCOUNT_CONTRACT" "onlyOwner"
reject_contains "$ACCOUNT_CONTRACT" "ECDSA"

require_contains "$SECURITY_REGISTRY" "msg.sender == account"
require_contains "$READINESS_REGISTRY" "accountReadiness[msg.sender]"

require_contains "$ACCEPTANCE_SCRIPT" "pnpm docs:acceptance"
require_contains "$ACCEPTANCE_SCRIPT" "pnpm admin:acceptance"
require_contains "$ACCEPTANCE_SCRIPT" "services/indexer/src/index.ts"
require_contains "$ACCEPTANCE_SCRIPT" "pnpm devnet:explorer-smoke"
require_contains "$ACCEPTANCE_SCRIPT" "pnpm devnet:pq-smoke"
require_contains "$ACCEPTANCE_SCRIPT" "pnpm devnet:pq-admin-smoke"
require_contains "$ACCEPTANCE_SCRIPT" "pnpm devnet:wallet-pq-smoke"
require_contains "$ACCEPTANCE_SCRIPT" "pnpm devnet:wallet-pq-rotate-smoke"
require_contains "$ACCEPTANCE_SCRIPT" "pnpm devnet:wallet-pq-backup-smoke"
require_contains "$ACCEPTANCE_SCRIPT" "pnpm devnet:wallet-app-acceptance"
require_contains "$ACCEPTANCE_SCRIPT" "pnpm devnet:wallet-app-ui-smoke"
require_contains "$ACCEPTANCE_SCRIPT" "pnpm devnet:proof-pack"
require_contains "$ROOT_DIR/package.json" "pnpm testnet:readiness"
require_contains "$ROOT_DIR/package.json" "testnet:material:generate"
require_contains "$ROOT_DIR/package.json" "testnet:launch-preflight"
require_contains "$ROOT_DIR/package.json" "research:sphincs-minus:smoke"

require_contains "$EXPLORER_SMOKE" "pnpm --silent proofs:verify"
require_contains "$PROOF_PACK" 'qbt-${networkName}-proof-pack-v1'
require_contains "$PROOF_PACK" "manifest.json"
require_contains "$PROOF_PACK" "verifier-report.json"
require_contains "$PROOF_PACK" "acceptance-summary.txt"
require_contains "$PROOF_PACK" "pnpm --silent proofs:verify"
require_contains "$PROOF_VERIFIER" "$CLAIM"
require_contains "$PROOF_VERIFIER" "eth_getTransactionReceipt"
require_contains "$PROOF_VERIFIER" "ExecutedPQ"
require_contains "$PROOF_VERIFIER" "QUBITOR_EVENT_TOPICS"

echo "[qubitor-docs] ok"
