#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLAIM="Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts."

fail() {
  echo "[qubitor-testnet-readiness] $*" >&2
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

reject_contains() {
  local file="$1"
  local pattern="$2"
  if grep -Fq -- "$pattern" "$file"; then
    fail "${file#$ROOT_DIR/} must not contain: $pattern"
  fi
}

COMPOSE="$ROOT_DIR/infra/docker-compose.yml"
COMPOSE_TESTNET="$ROOT_DIR/infra/docker-compose.testnet.yml"
COMPOSE_PUBLIC="$ROOT_DIR/infra/docker-compose.public.yml"
README="$ROOT_DIR/README.md"
RUNBOOK="$ROOT_DIR/docs/devnet/run-devnet.md"
TESTNET_READINESS="$ROOT_DIR/docs/testnet/readiness.md"
TESTNET_LAUNCH_MATERIAL="$ROOT_DIR/docs/testnet/launch-material.md"
SPHINCS_MINUS_TRACK="$ROOT_DIR/docs/quantum-readiness/sphincs-minus-track.md"
PQ_NATIVE_ARCHITECTURE="$ROOT_DIR/docs/architecture/pq-native-transaction-layer.md"
ENV_TESTNET="$ROOT_DIR/.env.testnet.example"
PACKAGE_JSON="$ROOT_DIR/package.json"
GITIGNORE="$ROOT_DIR/.gitignore"
ACCEPTANCE="$ROOT_DIR/scripts/devnet/acceptance.sh"
PROOF_PACK="$ROOT_DIR/scripts/devnet/proof-pack.sh"
DEPLOY_CONTRACTS="$ROOT_DIR/scripts/devnet/deploy-contracts.sh"
START_NODE="$ROOT_DIR/scripts/devnet/start.sh"
HEALTH_NODE="$ROOT_DIR/scripts/devnet/health.sh"
TESTNET_PREFLIGHT="$ROOT_DIR/scripts/testnet/launch-preflight.sh"
TESTNET_MATERIAL_GENERATOR="$ROOT_DIR/scripts/testnet/generate-launch-material.sh"
TESTNET_BOOTSTRAP_FUNDS="$ROOT_DIR/scripts/testnet/bootstrap-funds.sh"
TESTNET_RESET_WITH_BRIDGE_GENESIS="$ROOT_DIR/scripts/testnet/reset-with-bridge-genesis.sh"
TESTNET_BRIDGE_GENESIS_VERIFY="$ROOT_DIR/scripts/testnet/verify-bridge-genesis.mjs"
TESTNET_GENESIS="$ROOT_DIR/clients/qubitor-node/config/testnet/genesis.json"
TESTNET_BOOTNODES="$ROOT_DIR/clients/qubitor-node/config/testnet/bootnodes.json"
TESTNET_CONFIG_README="$ROOT_DIR/clients/qubitor-node/config/testnet/README.md"
QUBITOR_PRECOMPILE="$ROOT_DIR/clients/qubitor-node/coregeth/core/vm/contracts_qubitor.go"
QUBITOR_PRECOMPILE_TEST="$ROOT_DIR/clients/qubitor-node/coregeth/core/vm/contracts_qubitor_test.go"
ADMIN_INVENTORY="$ROOT_DIR/docs/security/admin-control-inventory.md"
CHAIN_CONFIG="$ROOT_DIR/packages/chain-config/src/index.ts"
RPC_GATEWAY="$ROOT_DIR/services/rpc-gateway/src/index.ts"
FAUCET_API="$ROOT_DIR/services/faucet-api/src/index.ts"
PQ_RELAYER="$ROOT_DIR/services/pq-relayer-api/src/index.ts"
INDEXER="$ROOT_DIR/services/indexer/src/index.ts"
EXPLORER="$ROOT_DIR/apps/explorer-lite/src/index.ts"

for file in \
  "$COMPOSE" \
  "$COMPOSE_TESTNET" \
  "$COMPOSE_PUBLIC" \
  "$README" \
  "$RUNBOOK" \
  "$TESTNET_READINESS" \
  "$TESTNET_LAUNCH_MATERIAL" \
  "$SPHINCS_MINUS_TRACK" \
  "$PQ_NATIVE_ARCHITECTURE" \
  "$ENV_TESTNET" \
  "$GITIGNORE" \
  "$PACKAGE_JSON" \
  "$ACCEPTANCE" \
  "$PROOF_PACK" \
  "$DEPLOY_CONTRACTS" \
  "$START_NODE" \
  "$HEALTH_NODE" \
  "$TESTNET_PREFLIGHT" \
  "$TESTNET_MATERIAL_GENERATOR" \
  "$TESTNET_BOOTSTRAP_FUNDS" \
  "$TESTNET_RESET_WITH_BRIDGE_GENESIS" \
  "$TESTNET_BRIDGE_GENESIS_VERIFY" \
  "$TESTNET_GENESIS" \
  "$TESTNET_BOOTNODES" \
  "$TESTNET_CONFIG_README" \
  "$QUBITOR_PRECOMPILE" \
  "$QUBITOR_PRECOMPILE_TEST" \
  "$ADMIN_INVENTORY" \
  "$CHAIN_CONFIG" \
  "$RPC_GATEWAY" \
  "$FAUCET_API" \
  "$PQ_RELAYER" \
  "$INDEXER" \
  "$EXPLORER"; do
  require_file "$file"
done

require_contains "$PACKAGE_JSON" "\"testnet:readiness\""
require_contains "$PACKAGE_JSON" "\"testnet:material:generate\""
require_contains "$PACKAGE_JSON" "\"testnet:launch-preflight\""
require_contains "$PACKAGE_JSON" "\"testnet:bootstrap-funds\""
require_contains "$PACKAGE_JSON" "\"testnet:reset-with-bridge-genesis\""
require_contains "$PACKAGE_JSON" "\"testnet:bridge-genesis:verify\""
require_contains "$PACKAGE_JSON" "\"research:sphincs-minus:smoke\""
require_contains "$PACKAGE_JSON" "\"devnet:proof-pack\""
require_contains "$PACKAGE_JSON" "\"pq-native:acceptance\""
require_contains "$GITIGNORE" ".env.testnet"

require_contains "$CHAIN_CONFIG" "getQubitorNetworkName"
require_contains "$CHAIN_CONFIG" "QUBITOR_NETWORK"
require_contains "$CHAIN_CONFIG" "unsupported Qubitor network"
require_contains "$CHAIN_CONFIG" "defaultQubitorExecutionRpcUrl"
require_contains "$QUBITOR_PRECOMPILE" "QubitorTestnetChainID = 91338"
require_contains "$QUBITOR_PRECOMPILE_TEST" "QubitorTestnetChainID"

require_contains "$COMPOSE" "build:"
require_contains "$COMPOSE" "../clients/qubitor-node/coregeth"
require_contains "$COMPOSE" "entrypoint: []"
require_contains "$COMPOSE" 'CI: "true"'
require_contains "$COMPOSE" "geth init --datadir=/data /genesis.json"
require_contains "$COMPOSE" "rpc-gateway"
require_contains "$COMPOSE" "faucet-api"
require_contains "$COMPOSE" "pq-relayer-api"
require_contains "$COMPOSE" "QUBITOR_FAUCET_PQ_SEED: \${QUBITOR_FAUCET_PQ_SEED:-}"
require_contains "$COMPOSE" "QUBITOR_FAUCET_ADDRESS: \${QUBITOR_FAUCET_ADDRESS:-}"
require_contains "$COMPOSE" "QUBITOR_PQ_RELAYER_WAIT_FOR_RECEIPT: \${QUBITOR_PQ_RELAYER_WAIT_FOR_RECEIPT:-1}"
require_contains "$COMPOSE" "indexer"
require_contains "$COMPOSE" "explorer-lite"
require_contains "$COMPOSE" "proof-pack"
require_contains "$COMPOSE" "QUBITOR_INDEXER_DATA_DIR: /data/indexer"
require_contains "$COMPOSE" "QUBITOR_NETWORK: \${QUBITOR_NETWORK:-devnet}"
require_contains "$COMPOSE" "QUBITOR_EOA_TXS: \${QUBITOR_EOA_TXS:-0}"
require_contains "$COMPOSE" "QUBITOR_NETWORK_ID: \${QUBITOR_NETWORK_ID:-91337}"
require_contains "$COMPOSE" "QUBITOR_BOOTNODES: \${QUBITOR_BOOTNODES:-}"
require_contains "$COMPOSE" "QUBITOR_NODEKEY_FILE"
require_contains "$COMPOSE" "QUBITOR_NODEKEY_HOST_FILE"
require_contains "$COMPOSE" "QUBITOR_GENESIS_HOST_FILE"
require_contains "$COMPOSE" "--nodekey"
require_contains "$COMPOSE" "QUBITOR_P2P_NAT"
require_contains "$COMPOSE" "QUBITOR_P2P_TCP_PORT"
require_contains "$COMPOSE" "QUBITOR_P2P_UDP_PORT"
require_contains "$COMPOSE" "\${QUBITOR_GENESIS_HOST_FILE:-../clients/qubitor-node/config/devnet/genesis.json}:/genesis.json:ro"
require_contains "$COMPOSE" "../data/node/\${QUBITOR_NETWORK:-devnet}:/data"
require_contains "$COMPOSE" "QUBITOR_DEPLOYMENTS_FILE: /repo/contracts/deployments/\${QUBITOR_NETWORK:-devnet}/deployments.json"
require_contains "$COMPOSE" "QUBITOR_PROOF_PACK_DIR: /repo/artifacts/proofs/\${QUBITOR_NETWORK:-devnet}"
require_contains "$COMPOSE" "../data/indexer/\${QUBITOR_NETWORK:-devnet}:/data/indexer"
reject_contains "$COMPOSE" "etclabscore/core-geth:latest"

require_contains "$COMPOSE_PUBLIC" "public-gateway"
require_contains "$COMPOSE_PUBLIC" "caddy:2"
require_contains "$COMPOSE_PUBLIC" "QUBITOR_PUBLIC_RPC_URL"
require_contains "$COMPOSE_PUBLIC" "QUBITOR_PUBLIC_RPC_ALIASES"
require_contains "$COMPOSE_PUBLIC" "reverse_proxy pq-relayer-api:18548"
require_contains "$COMPOSE_PUBLIC" "reverse_proxy rpc-gateway:18545"
require_contains "$COMPOSE_PUBLIC" "handle /faucet*"
require_contains "$COMPOSE_PUBLIC" "reverse_proxy explorer-lite:18547"
require_contains "$COMPOSE_PUBLIC" "reverse_proxy faucet-api:18546"
require_contains "$COMPOSE_PUBLIC" "QUBITOR_PUBLIC_HTTP_PORT"
require_contains "$COMPOSE_PUBLIC" "QUBITOR_PUBLIC_HTTPS_PORT"

require_contains "$COMPOSE_TESTNET" "QUBITOR_NETWORK: testnet"
require_contains "$COMPOSE_TESTNET" 'QUBITOR_EOA_TXS: "0"'
require_contains "$COMPOSE_TESTNET" "QUBITOR_NETWORK_ID: \${QUBITOR_NETWORK_ID:-91338}"
require_contains "$COMPOSE_TESTNET" "QUBITOR_GENESIS_HOST_FILE"
require_contains "$COMPOSE_TESTNET" "../clients/qubitor-node/config/testnet/genesis.json"
require_contains "$COMPOSE_TESTNET" "../data/node/testnet:/data"
require_contains "$COMPOSE_TESTNET" "../data/indexer/testnet:/data/indexer"
require_contains "$COMPOSE_TESTNET" "/repo/contracts/deployments/testnet/deployments.json"
require_contains "$COMPOSE_TESTNET" "/repo/artifacts/proofs/testnet"

require_contains "$ACCEPTANCE" "pnpm devnet:proof-pack"
require_contains "$DEPLOY_CONTRACTS" 'contracts/deployments/$NETWORK'
require_contains "$DEPLOY_CONTRACTS" "installing canonical system contracts into genesis"
require_contains "$DEPLOY_CONTRACTS" "QUBITOR_DEPLOYER_PRIVATE_KEY is ignored and prohibited"
require_contains "$START_NODE" 'clients/qubitor-node/config/$NETWORK/genesis.json'
require_contains "$START_NODE" "QUBITOR_BOOTNODES"
require_contains "$START_NODE" "--networkid \"\$CHAIN_ID\""
require_contains "$HEALTH_NODE" "EXPECTED_CHAIN_ID_HEX"
require_contains "$PROOF_PACK" 'qbt-${networkName}-proof-pack-v1'
require_contains "$PROOF_PACK" "manifest.json"
require_contains "$PROOF_PACK" "verifier-report.json"
require_contains "$PROOF_PACK" 'artifacts/proofs/$NETWORK'

require_contains "$TESTNET_GENESIS" "\"chainId\": 91338"
require_contains "$TESTNET_GENESIS" "0000000000000000000000000000000000000201"
require_contains "$TESTNET_GENESIS" "0000000000000000000000000000000000000202"
require_contains "$TESTNET_GENESIS" "0000000000000000000000000000000000000203"
require_contains "$TESTNET_GENESIS" "0000000000000000000000000000000000000301"
require_contains "$TESTNET_GENESIS" "0000000000000000000000000000000000000302"
require_contains "$TESTNET_GENESIS" "0000000000000000000000000000000000000303"
require_contains "$TESTNET_GENESIS" "0xd3c21bcecceda1000000"
require_contains "$TESTNET_GENESIS" "0x3635c9adc5dea00000"
reject_contains "$TESTNET_GENESIS" "f39fd6e51aad88f6f4ce6ab8827279cfffb92266"
reject_contains "$TESTNET_GENESIS" "70997970c51812dc3a010c7d01b50e0d17dc79c8"
reject_contains "$TESTNET_GENESIS" "3c44cdddb6a900fa2b585dd299e03d12fa4293bc"
require_contains "$TESTNET_BOOTNODES" "\"network\": \"testnet\""
require_contains "$TESTNET_BOOTNODES" "\"chainId\": 91338"
require_contains "$TESTNET_BOOTNODES" "\"bootnodes\": []"
require_contains "$TESTNET_PREFLIGHT" "QUBITOR_BOOTNODES"
require_contains "$TESTNET_PREFLIGHT" ".env.testnet"
require_contains "$TESTNET_PREFLIGHT" "QUBITOR_BOOTNODE_MIN_COUNT"
require_contains "$TESTNET_PREFLIGHT" "QUBITOR_EOA_TXS=0 is required"
require_contains "$TESTNET_PREFLIGHT" "QUBITOR_PQ_SERVICE_KEYS_FILE"
require_contains "$TESTNET_PREFLIGHT" "QUBITOR_FAUCET_PQ_SEED"
require_contains "$TESTNET_PREFLIGHT" "QUBITOR_FAUCET_TREASURY_VAULT"
require_contains "$TESTNET_PREFLIGHT" "QubitorTestnetChainID = 91338"
require_contains "$TESTNET_PREFLIGHT" "bootnode must advertise a public host"
require_contains "$TESTNET_PREFLIGHT" "duplicate bootnode advertised endpoint"
require_contains "$TESTNET_PREFLIGHT" "must be a public https URL"
require_contains "$TESTNET_PREFLIGHT" "QUBITOR_MINER_PRIVATE_KEY"
require_contains "$TESTNET_PREFLIGHT" "is prohibited for Qubitor-native testnet launch"
require_contains "$TESTNET_MATERIAL_GENERATOR" "@qubitor/pq-native-tx"
require_contains "$TESTNET_MATERIAL_GENERATOR" "devp2p key generate"
require_contains "$TESTNET_MATERIAL_GENERATOR" "artifacts/testnet/launch"
require_contains "$TESTNET_MATERIAL_GENERATOR" "pq-service-keys.json"
require_contains "$TESTNET_MATERIAL_GENERATOR" "node-env"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_NODEKEY_FILE"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_DOCKER_NODEKEY_FILE"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_GENESIS_HOST_FILE"
require_contains "$TESTNET_MATERIAL_GENERATOR" "OUT_DIR_REL"
require_contains "$TESTNET_MATERIAL_GENERATOR" "faucet-treasury-and-miner-rewards"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_BOOTNODE_PUBLIC_HOSTS"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_TESTNET_SERVER_HOSTS"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_TESTNET_SERVER_HOST"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_TESTNET_BOOTNODE_2_HOST"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_TESTNET_SERVER_ENV_FILE"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_TESTNET_SERVER_PASSWORD"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_BOOTNODE_MIN_COUNT"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_EOA_TXS=0"
require_contains "$TESTNET_MATERIAL_GENERATOR" "https://testrpc.qubitor.org"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_FAUCET_PQ_SEED"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_PQ_SERVICE_KEYS_FILE"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_P2P_TCP_PORT"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_P2P_UDP_PORT"
require_contains "$TESTNET_MATERIAL_GENERATOR" "QUBITOR_P2P_NAT"
require_contains "$TESTNET_MATERIAL_GENERATOR" "bootnodeCount"
require_contains "$TESTNET_BOOTSTRAP_FUNDS" "QUBITOR_MINER_ETHERBASE"
require_contains "$TESTNET_BOOTSTRAP_FUNDS" "QUBITOR_FAUCET_TREASURY_VAULT"
require_contains "$TESTNET_BOOTSTRAP_FUNDS" ".env.testnet"
require_contains "$TESTNET_BOOTSTRAP_FUNDS" "QUBITOR_NETWORK must be testnet"
require_contains "$TESTNET_BOOTSTRAP_FUNDS" "QUBITOR_EOA_TXS=0 is required"
require_contains "$TESTNET_BOOTSTRAP_FUNDS" "faucet treasury balance"
require_contains "$TESTNET_BOOTSTRAP_FUNDS" "no EOA bootstrap transfers"
require_contains "$TESTNET_RESET_WITH_BRIDGE_GENESIS" "verify-bridge-genesis.mjs"
require_contains "$TESTNET_RESET_WITH_BRIDGE_GENESIS" "QUBITOR_TESTNET_SERVER_SSH_KEY"
require_contains "$TESTNET_RESET_WITH_BRIDGE_GENESIS" "rm -rf data/node/testnet data/indexer/testnet"
require_contains "$TESTNET_BRIDGE_GENESIS_VERIFY" "eth_getCode"
require_contains "$TESTNET_BRIDGE_GENESIS_VERIFY" "0x0000000000000000000000000000000000000301"
require_contains "$TESTNET_BRIDGE_GENESIS_VERIFY" "0x0000000000000000000000000000000000000302"
require_contains "$TESTNET_BRIDGE_GENESIS_VERIFY" "0x0000000000000000000000000000000000000303"
require_contains "$TESTNET_BRIDGE_GENESIS_VERIFY" "initialNativeLiquidityWei"
require_contains "$TESTNET_BRIDGE_GENESIS_VERIFY" "guardianGasBalanceWei"

for file in "$RPC_GATEWAY" "$FAUCET_API" "$PQ_RELAYER" "$INDEXER" "$EXPLORER"; do
  require_contains "$file" "getQubitorNetworkName"
  require_contains "$file" "getConfiguredQubitorNetwork"
done

for file in "$RPC_GATEWAY" "$FAUCET_API" "$PQ_RELAYER" "$INDEXER"; do
  require_contains "$file" "defaultQubitorExecutionRpcUrl"
done

require_contains "$FAUCET_API" "faucet refuses the deterministic devnet PQ seed"
require_contains "$INDEXER" 'data/indexer/${networkName}'

require_contains "$ENV_TESTNET" "QUBITOR_TESTNET_SERVER_HOST=66.29.136.165"
require_contains "$ENV_TESTNET" "QUBITOR_TESTNET_SERVER_USER=replace-with-ubuntu-ssh-user"
require_contains "$ENV_TESTNET" "QUBITOR_TESTNET_SERVER_SSH_PORT=22"
require_contains "$ENV_TESTNET" "QUBITOR_TESTNET_SERVER_AUTH=password"
require_contains "$ENV_TESTNET" "QUBITOR_TESTNET_BOOTNODE_2_HOST=replace-with-second-bootnode-ip-or-dns"
require_contains "$ENV_TESTNET" "QUBITOR_TESTNET_BOOTNODE_2_USER=replace-with-second-bootnode-ssh-user"
require_contains "$ENV_TESTNET" "QUBITOR_TESTNET_BOOTNODE_2_AUTH=password"
require_contains "$ENV_TESTNET" "QUBITOR_TESTNET_SERVER_AUTH=key"
require_contains "$ENV_TESTNET" "QUBITOR_TESTNET_SERVER_SSH_KEY=~/.ssh/id_ed25519"
require_contains "$ENV_TESTNET" ".env.testnet.local"
require_contains "$ENV_TESTNET" ".env.testnet"
require_contains "$ENV_TESTNET" "generated on the server"
require_contains "$ENV_TESTNET" "artifacts/testnet/launch/<timestamp>/.env.testnet.local"
reject_contains "$ENV_TESTNET" "QUBITOR_TESTNET_SERVER_PASSWORD="
reject_contains "$ENV_TESTNET" "QUBITOR_NETWORK=testnet"
reject_contains "$ENV_TESTNET" "QUBITOR_BOOTNODES="
reject_contains "$ENV_TESTNET" "QUBITOR_MINER_PRIVATE_KEY="
reject_contains "$ENV_TESTNET" "QUBITOR_DEPLOYER_PRIVATE_KEY="
reject_contains "$ENV_TESTNET" "QUBITOR_FAUCET_PRIVATE_KEY="
reject_contains "$ENV_TESTNET" "QUBITOR_PQ_RELAYER_PRIVATE_KEY="
reject_contains "$ENV_TESTNET" "QUBITOR_FAUCET_TREASURY_MODE="
reject_contains "$ENV_TESTNET" "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
reject_contains "$ENV_TESTNET" "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
reject_contains "$ENV_TESTNET" "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"

require_contains "$TESTNET_READINESS" "$CLAIM"
require_contains "$TESTNET_READINESS" "pnpm testnet:readiness"
require_contains "$TESTNET_READINESS" "pnpm testnet:material:generate"
require_contains "$TESTNET_READINESS" "pnpm testnet:launch-preflight"
require_contains "$TESTNET_READINESS" "pnpm testnet:bootstrap-funds"
require_contains "$TESTNET_READINESS" "pnpm testnet:reset-with-bridge-genesis"
require_contains "$TESTNET_READINESS" "pnpm testnet:bridge-genesis:verify"
require_contains "$TESTNET_READINESS" "docker compose -f infra/docker-compose.yml --profile all up --build"
require_contains "$TESTNET_READINESS" "clients/qubitor-node/config/testnet/genesis.json"
require_contains "$TESTNET_READINESS" "QUBITOR_BOOTNODE_PUBLIC_HOSTS"
require_contains "$TESTNET_READINESS" "public testnet chain ID"
require_contains "$TESTNET_READINESS" "verified proof pack"
require_contains "$TESTNET_READINESS" "Qubitor Account or stricter PQ policy"
require_contains "$TESTNET_READINESS" "No EOA anywhere"
require_contains "$TESTNET_READINESS" "Qubitor wallet address"
require_contains "$TESTNET_READINESS" '`QUBITOR_EOA_TXS=0` is missing'
require_contains "$TESTNET_READINESS" "QUBITOR_PQ_SERVICE_KEYS_FILE"
require_contains "$TESTNET_READINESS" "node-env/bootnode-*.env"
require_contains "$TESTNET_READINESS" "QUBITOR_GENESIS_HOST_FILE"
require_contains "$TESTNET_READINESS" "/faucet/*"
require_contains "$TESTNET_READINESS" 'QUBITOR_MINER_PRIVATE_KEY` is prohibited for Qubitor-native launch'
require_contains "$TESTNET_LAUNCH_MATERIAL" "pnpm testnet:material:generate"
require_contains "$TESTNET_LAUNCH_MATERIAL" "bootnodes.json"
require_contains "$TESTNET_LAUNCH_MATERIAL" "pq-service-keys.json"
require_contains "$TESTNET_LAUNCH_MATERIAL" "node-env/bootnode-*.env"
require_contains "$TESTNET_LAUNCH_MATERIAL" "QUBITOR_TESTNET_SERVER_ENV_FILE"
require_contains "$TESTNET_LAUNCH_MATERIAL" "QUBITOR_NETWORK=testnet"
require_contains "$TESTNET_LAUNCH_MATERIAL" "QUBITOR_EOA_TXS=0"
require_contains "$TESTNET_LAUNCH_MATERIAL" "QUBITOR_GENESIS_HOST_FILE"
require_contains "$TESTNET_LAUNCH_MATERIAL" "QUBITOR_BOOTNODE_PUBLIC_HOSTS"
require_contains "$TESTNET_LAUNCH_MATERIAL" "QUBITOR_BOOTNODE_MIN_COUNT"
require_contains "$TESTNET_LAUNCH_MATERIAL" "pnpm testnet:bootstrap-funds"
require_contains "$TESTNET_LAUNCH_MATERIAL" "Dedicated Ubuntu Server"
require_contains "$TESTNET_LAUNCH_MATERIAL" "sudo ufw allow 30303/tcp"
require_contains "$TESTNET_LAUNCH_MATERIAL" "ssh -N -L 18548:127.0.0.1:18548"
require_contains "$TESTNET_LAUNCH_MATERIAL" "Do not commit generated material"
require_contains "$SPHINCS_MINUS_TRACK" "https://github.com/Quantx256hash/sphincsminus"
require_contains "$SPHINCS_MINUS_TRACK" "third_party/sphincsminus"
require_contains "$SPHINCS_MINUS_TRACK" "not part of Qubitor consensus"
require_contains "$PQ_NATIVE_ARCHITECTURE" "No EOA anywhere"
require_contains "$PQ_NATIVE_ARCHITECTURE" "QubitorPQTxV1"
require_contains "$PQ_NATIVE_ARCHITECTURE" "legacy Ethereum transaction types"
require_contains "$PQ_NATIVE_ARCHITECTURE" "Qubitor wallet address"

require_contains "$ADMIN_INVENTORY" "Any treasury, upgrade, bridge, governance, or emergency authority must be a Qubitor Account or stricter PQ policy"
require_contains "$ADMIN_INVENTORY" "Any privileged asset movement, treasury policy, bridge policy, upgrade policy, or emergency policy must require PQ authorization."
require_contains "$RUNBOOK" "pnpm devnet:proof-pack"
require_contains "$README" "pnpm devnet:proof-pack"

echo "[qubitor-testnet-readiness] ok"
