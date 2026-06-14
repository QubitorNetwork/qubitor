#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${QUBITOR_TESTNET_ENV_FILE:-}"
if [[ -z "$ENV_FILE" && -f "$ROOT_DIR/.env.testnet.local" ]] && grep -Eq '^QUBITOR_NETWORK=testnet$' "$ROOT_DIR/.env.testnet.local"; then
  ENV_FILE="$ROOT_DIR/.env.testnet.local"
fi
if [[ -z "$ENV_FILE" && -f "$ROOT_DIR/.env.testnet" ]] && grep -Eq '^QUBITOR_NETWORK=testnet$' "$ROOT_DIR/.env.testnet"; then
  ENV_FILE="$ROOT_DIR/.env.testnet"
fi

fail() {
  echo "[qubitor-testnet-preflight] $*" >&2
  exit 1
}

require_file() {
  local file="$1"
  [[ -f "$file" ]] || fail "missing file: ${file#$ROOT_DIR/}"
}

require_env() {
  local name="$1"
  local value="${!name:-}"
  [[ -n "$value" ]] || fail "$name is required"
  case "$value" in
    replace-*|*".example"|*".invalid"|*"example"*|*"placeholder"*)
      fail "$name still contains a placeholder value"
      ;;
  esac
}

require_address_env() {
  local name="$1"
  require_env "$name"
  local value="${!name}"
  [[ "$value" =~ ^0x[0-9a-fA-F]{40}$ ]] || fail "$name must be a 20-byte hex address"
}

reject_private_key_env() {
  local name="$1"
  if [[ -n "${!name:-}" ]]; then
    fail "$name is prohibited for Qubitor-native testnet launch"
  fi
}

require_hex_seed_env() {
  local name="$1"
  require_env "$name"
  local value="${!name}"
  [[ "$value" =~ ^0x[0-9a-fA-F]{64}$ ]] || fail "$name must be a 32-byte hex seed"
}

reject_devnet_pq_seed() {
  local name="$1"
  require_hex_seed_env "$name"
  local value="${!name,,}"
  case "$value" in
    0x5151515151515151515151515151515151515151515151515151515151515151)
      fail "$name must not reuse the deterministic devnet PQ seed"
      ;;
  esac
}

if [[ -n "$ENV_FILE" ]]; then
  require_file "$ENV_FILE"
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

command -v node >/dev/null 2>&1 || fail "node is required"

[[ "${QUBITOR_NETWORK:-}" == "testnet" ]] || fail "QUBITOR_NETWORK must be testnet"
[[ "${QUBITOR_NETWORK_ID:-91338}" == "91338" ]] || fail "QUBITOR_NETWORK_ID must be 91338"
[[ "${QUBITOR_PUBLIC_TESTNET_CHAIN_ID:-91338}" == "91338" ]] || fail "QUBITOR_PUBLIC_TESTNET_CHAIN_ID must be 91338"
[[ "${QUBITOR_EOA_TXS:-}" == "0" ]] || fail "QUBITOR_EOA_TXS=0 is required for Qubitor-native testnet launch"
BOOTNODE_MIN_COUNT="${QUBITOR_BOOTNODE_MIN_COUNT:-1}"
case "$BOOTNODE_MIN_COUNT" in
  ''|*[!0-9]*) fail "QUBITOR_BOOTNODE_MIN_COUNT must be a positive integer" ;;
esac
if [[ "$BOOTNODE_MIN_COUNT" -lt 1 ]]; then
  fail "QUBITOR_BOOTNODE_MIN_COUNT must be at least 1"
fi
export QUBITOR_BOOTNODE_MIN_COUNT="$BOOTNODE_MIN_COUNT"

GENESIS_FILE="${QUBITOR_GENESIS_FILE:-$ROOT_DIR/clients/qubitor-node/config/testnet/genesis.json}"
if [[ "$GENESIS_FILE" != /* ]]; then
  GENESIS_FILE="$ROOT_DIR/$GENESIS_FILE"
fi
BOOTNODES_FILE="${QUBITOR_BOOTNODES_FILE:-$ROOT_DIR/clients/qubitor-node/config/testnet/bootnodes.json}"
if [[ "$BOOTNODES_FILE" != /* ]]; then
  BOOTNODES_FILE="$ROOT_DIR/$BOOTNODES_FILE"
fi

require_file "$GENESIS_FILE"
require_file "$BOOTNODES_FILE"

node - "$GENESIS_FILE" "$BOOTNODES_FILE" <<'NODE'
const fs = require("node:fs");
const [genesisFile, bootnodesFile] = process.argv.slice(2);
const fail = (message) => {
  console.error(`[qubitor-testnet-preflight] ${message}`);
  process.exit(1);
};

const genesis = JSON.parse(fs.readFileSync(genesisFile, "utf8"));
if (genesis?.config?.chainId !== 91338) fail("testnet genesis chainId must be 91338");
if (genesis?.config?.londonBlock !== 0) fail("testnet genesis must enable London from genesis");
if (Number(BigInt(genesis.gasLimit ?? "0")) !== 30_000_000) fail("testnet genesis gasLimit must be 30,000,000");

const devnetAddresses = new Set([
  "f39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  "70997970c51812dc3a010c7d01b50e0d17dc79c8",
  "3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
]);
for (const address of Object.keys(genesis.alloc ?? {})) {
  if (devnetAddresses.has(address.toLowerCase().replace(/^0x/, ""))) {
    fail(`testnet genesis must not pre-fund deterministic devnet address ${address}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(bootnodesFile, "utf8"));
if (manifest.network !== "testnet") fail("bootnodes manifest network must be testnet");
if (manifest.chainId !== 91338) fail("bootnodes manifest chainId must be 91338");

const minBootnodes = Number.parseInt(process.env.QUBITOR_BOOTNODE_MIN_COUNT ?? "1", 10);
if (!Number.isSafeInteger(minBootnodes) || minBootnodes < 1) {
  fail("QUBITOR_BOOTNODE_MIN_COUNT must be a positive integer");
}
const envBootnodes = (process.env.QUBITOR_BOOTNODES ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const bootnodes = envBootnodes.length > 0 ? envBootnodes : manifest.bootnodes;
if (!Array.isArray(bootnodes) || bootnodes.length < minBootnodes) {
  fail(`at least ${minBootnodes} real testnet bootnode(s) are required through QUBITOR_BOOTNODES or bootnodes.json`);
}

if (manifest.nodes !== undefined) {
  if (!Array.isArray(manifest.nodes)) fail("bootnodes manifest nodes must be an array when present");
  if (manifest.nodes.length !== manifest.bootnodes.length) {
    fail("bootnodes manifest nodes length must match bootnodes length");
  }
  const manifestBootnodes = new Set(manifest.bootnodes);
  for (const node of manifest.nodes) {
    if (typeof node !== "object" || node === null) fail("bootnodes manifest node entries must be objects");
    if (typeof node.enode !== "string" || !manifestBootnodes.has(node.enode)) {
      fail("bootnodes manifest node enode must appear in bootnodes");
    }
    if (typeof node.advertisedHost !== "string" || node.advertisedHost.length === 0) {
      fail("bootnodes manifest node advertisedHost is required");
    }
    for (const [field, value] of [["tcpPort", node.tcpPort], ["udpPort", node.udpPort]]) {
      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        fail(`bootnodes manifest node ${field} must be a TCP/UDP port`);
      }
    }
  }
}

const parseEnodeEndpoint = (bootnode) => {
  if (!bootnode.startsWith("enode://")) return null;
  const at = bootnode.indexOf("@");
  if (at === -1) fail(`enode bootnode must include an advertised endpoint: ${bootnode}`);
  const endpoint = bootnode.slice(at + 1).split("?")[0];
  if (endpoint.startsWith("[")) {
    const end = endpoint.indexOf("]");
    if (end === -1 || endpoint[end + 1] !== ":") fail(`invalid enode IPv6 endpoint: ${bootnode}`);
    return { host: endpoint.slice(1, end).toLowerCase(), port: endpoint.slice(end + 2).split(":")[0] };
  }
  const match = endpoint.match(/^([^:/?#]+):([0-9]+)/);
  if (!match) fail(`invalid enode endpoint: ${bootnode}`);
  return { host: match[1].toLowerCase(), port: match[2] };
};

const isPrivateHost = (host) =>
  host === "localhost" ||
  host === "0.0.0.0" ||
  host === "::" ||
  host === "::1" ||
  host.startsWith("127.") ||
  host.startsWith("10.") ||
  host.startsWith("192.168.") ||
  host.startsWith("fc00:") ||
  host.startsWith("fd") ||
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);

const seenBootnodes = new Set();
const seenEndpoints = new Set();
for (const bootnode of bootnodes) {
  if (typeof bootnode !== "string") fail("bootnode entries must be strings");
  if (bootnode.includes("example") || bootnode.includes("replace")) fail(`bootnode is still a placeholder: ${bootnode}`);
  if (!bootnode.startsWith("enode://") && !bootnode.startsWith("enr:")) {
    fail(`bootnode must start with enode:// or enr:: ${bootnode}`);
  }
  if (seenBootnodes.has(bootnode)) fail(`duplicate bootnode entry: ${bootnode}`);
  seenBootnodes.add(bootnode);

  const endpoint = parseEnodeEndpoint(bootnode);
  if (endpoint) {
    if (isPrivateHost(endpoint.host)) {
      fail(`bootnode must advertise a public host, got ${endpoint.host}`);
    }
    const endpointKey = `${endpoint.host}:${endpoint.port}`;
    if (seenEndpoints.has(endpointKey)) {
      fail(`duplicate bootnode advertised endpoint: ${endpointKey}`);
    }
    seenEndpoints.add(endpointKey);
  }
}
NODE

for name in QUBITOR_PUBLIC_RPC_URL QUBITOR_PUBLIC_EXPLORER_URL QUBITOR_PUBLIC_FAUCET_URL; do
  require_env "$name"
  node -e '
    try {
      const url = new URL(process.argv[1]);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== "https:") process.exit(2);
      if (
        host === "localhost" ||
        host.endsWith(".example") ||
        host.endsWith(".invalid") ||
        host.startsWith("127.") ||
        host.startsWith("10.") ||
        host.startsWith("192.168.") ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
      ) process.exit(3);
    } catch {
      process.exit(1);
    }
  ' "${!name}" || fail "$name must be a public https URL"
done

reject_private_key_env QUBITOR_DEPLOYER_PRIVATE_KEY
reject_private_key_env QUBITOR_FAUCET_PRIVATE_KEY
reject_private_key_env QUBITOR_PQ_RELAYER_PRIVATE_KEY
reject_private_key_env QUBITOR_MINER_PRIVATE_KEY
reject_devnet_pq_seed QUBITOR_FAUCET_PQ_SEED
require_address_env QUBITOR_MINER_ETHERBASE
require_address_env QUBITOR_FAUCET_TREASURY_VAULT
require_env QUBITOR_PQ_SERVICE_KEYS_FILE
PQ_SERVICE_KEYS_FILE="$QUBITOR_PQ_SERVICE_KEYS_FILE"
if [[ "$PQ_SERVICE_KEYS_FILE" != /* ]]; then
  PQ_SERVICE_KEYS_FILE="$ROOT_DIR/$PQ_SERVICE_KEYS_FILE"
fi
require_file "$PQ_SERVICE_KEYS_FILE"
node - "$PQ_SERVICE_KEYS_FILE" "$QUBITOR_FAUCET_PQ_SEED" "$QUBITOR_FAUCET_TREASURY_VAULT" "$QUBITOR_MINER_ETHERBASE" <<'NODE'
const fs = require("node:fs");
const [file, faucetSeed, faucetVault, minerEtherbase] = process.argv.slice(2);
const fail = (message) => {
  console.error(`[qubitor-testnet-preflight] ${message}`);
  process.exit(1);
};

const material = JSON.parse(fs.readFileSync(file, "utf8"));
const isHex = (value, bytes) =>
  typeof value === "string" && new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(value);
for (const name of ["faucetTreasury", "minerRewards"]) {
  if (typeof material[name] !== "object" || material[name] === null) {
    fail(`pq service keys file missing ${name}`);
  }
  if (!isHex(material[name].address, 20)) fail(`${name}.address must be a 20-byte hex address`);
  if (!isHex(material[name].publicKey, 1952)) fail(`${name}.publicKey must be an ML-DSA-65 public key`);
  if (!isHex(material[name].seed, 32)) fail(`${name}.seed must be a 32-byte hex seed`);
}
if (material.faucetTreasury.seed.toLowerCase() !== faucetSeed.toLowerCase()) {
  fail("QUBITOR_FAUCET_PQ_SEED must match pq-service-keys faucetTreasury.seed");
}
const faucetAddress = material.faucetTreasury.address.toLowerCase();
const minerAddress = material.minerRewards.address.toLowerCase();
if (faucetVault.toLowerCase() !== faucetAddress) {
  fail("QUBITOR_FAUCET_TREASURY_VAULT must match pq-service-keys faucetTreasury.address for this launch material");
}
if (minerEtherbase.toLowerCase() !== minerAddress) {
  fail("QUBITOR_MINER_ETHERBASE must match pq-service-keys minerRewards.address for this launch material");
}
NODE

[[ "${QUBITOR_FAUCET_TREASURY_MODE:-}" != "hot-wallet-devnet" ]] || fail "faucet treasury mode must not be hot-wallet-devnet"
[[ "${QUBITOR_FAUCET_TREASURY_MODE:-}" == "pq-controlled-testnet" ]] || fail "QUBITOR_FAUCET_TREASURY_MODE must be pq-controlled-testnet"

grep -Fq "QubitorTestnetChainID = 91338" "$ROOT_DIR/clients/qubitor-node/coregeth/core/vm/contracts_qubitor.go" \
  || fail "CoreGeth precompile gate must include QubitorTestnetChainID = 91338"

echo "[qubitor-testnet-preflight] ok"
