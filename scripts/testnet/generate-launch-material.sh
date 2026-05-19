#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COREGETH_DIR="$ROOT_DIR/clients/qubitor-node/coregeth"

SERVER_ENV_FILE="${QUBITOR_TESTNET_SERVER_ENV_FILE:-}"
if [[ -z "$SERVER_ENV_FILE" && -f "$ROOT_DIR/.env.testnet" ]]; then
  SERVER_ENV_FILE="$ROOT_DIR/.env.testnet"
elif [[ -z "$SERVER_ENV_FILE" && -f "$ROOT_DIR/.env.testnet.local" ]]; then
  SERVER_ENV_FILE="$ROOT_DIR/.env.testnet.local"
fi
if [[ -n "$SERVER_ENV_FILE" ]]; then
  [[ -f "$SERVER_ENV_FILE" ]] || {
    echo "[qubitor-testnet-material] missing server env file: $SERVER_ENV_FILE" >&2
    exit 1
  }
  set -a
  # shellcheck source=/dev/null
  source "$SERVER_ENV_FILE"
  set +a
  if [[ -n "${QUBITOR_TESTNET_SERVER_PASSWORD:-}" || -n "${QUBITOR_TESTNET_BOOTNODE_2_PASSWORD:-}" ]]; then
    echo "[qubitor-testnet-material] do not store SSH passwords in $SERVER_ENV_FILE; SSH should prompt for them" >&2
    exit 1
  fi
fi

OUT_ROOT="${QUBITOR_TESTNET_MATERIAL_DIR:-$ROOT_DIR/artifacts/testnet/launch}"
STAMP="${QUBITOR_TESTNET_MATERIAL_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
OUT_DIR="$OUT_ROOT/$STAMP"
KEY_DIR="$OUT_DIR/keys"
NODE_ENV_DIR="$OUT_DIR/node-env"
if [[ "$OUT_DIR" == "$ROOT_DIR/"* ]]; then
  OUT_DIR_REL="${OUT_DIR#"$ROOT_DIR/"}"
else
  OUT_DIR_REL="$OUT_DIR"
fi
BOOTNODE_COUNT="${QUBITOR_BOOTNODE_COUNT:-}"
SERVER_HOSTS_RAW="${QUBITOR_TESTNET_SERVER_HOSTS:-}"
if [[ -z "$SERVER_HOSTS_RAW" && -n "${QUBITOR_TESTNET_SERVER_HOST:-}" ]]; then
  SERVER_HOSTS_RAW="$QUBITOR_TESTNET_SERVER_HOST"
  if [[ -n "${QUBITOR_TESTNET_BOOTNODE_2_HOST:-}" ]]; then
    SERVER_HOSTS_RAW="$SERVER_HOSTS_RAW,$QUBITOR_TESTNET_BOOTNODE_2_HOST"
  fi
fi
BOOTNODE_HOSTS_RAW="${QUBITOR_BOOTNODE_PUBLIC_HOSTS:-${SERVER_HOSTS_RAW:-${QUBITOR_BOOTNODE_PUBLIC_IP:-127.0.0.1}}}"
BOOTNODE_TCP_PORTS_RAW="${QUBITOR_BOOTNODE_TCP_PORTS:-${QUBITOR_BOOTNODE_TCP_PORT:-30303}}"
BOOTNODE_UDP_PORTS_RAW="${QUBITOR_BOOTNODE_UDP_PORTS:-${QUBITOR_BOOTNODE_UDP_PORT:-}}"
BOOTNODE_MIN_COUNT="${QUBITOR_BOOTNODE_MIN_COUNT:-1}"
ENV_FILE="$OUT_DIR/.env.testnet.local"
BOOTNODES_FILE="$OUT_DIR/bootnodes.json"
SERVICE_KEYS_FILE="$OUT_DIR/pq-service-keys.json"

fail() {
  echo "[qubitor-testnet-material] $*" >&2
  exit 1
}

require_command() {
  local name="$1"
  command -v "$name" >/dev/null 2>&1 || fail "$name is required"
}

split_csv() {
  local raw="$1"
  local target_name="$2"
  local -n target="$target_name"
  local -a parts=()
  local part

  target=()
  IFS=',' read -r -a parts <<< "$raw"
  for part in "${parts[@]}"; do
    part="${part#"${part%%[![:space:]]*}"}"
    part="${part%"${part##*[![:space:]]}"}"
    if [[ -n "$part" ]]; then
      target+=("$part")
    fi
  done
}

validate_port() {
  local name="$1"
  local port="$2"
  if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
    fail "$name must be a TCP/UDP port between 1 and 65535"
  fi
}

run_devp2p() {
  if [[ -n "${QUBITOR_DEVP2P_BIN:-}" ]]; then
    "$QUBITOR_DEVP2P_BIN" "$@"
  else
    (cd "$COREGETH_DIR" && GOWORK=off go run ./cmd/devp2p "$@")
  fi
}

BOOTNODE_HOSTS=()
BOOTNODE_TCP_PORTS=()
BOOTNODE_UDP_PORTS=()
split_csv "$BOOTNODE_HOSTS_RAW" BOOTNODE_HOSTS
split_csv "$BOOTNODE_TCP_PORTS_RAW" BOOTNODE_TCP_PORTS
if [[ -n "$BOOTNODE_UDP_PORTS_RAW" ]]; then
  split_csv "$BOOTNODE_UDP_PORTS_RAW" BOOTNODE_UDP_PORTS
fi

if [[ "${#BOOTNODE_HOSTS[@]}" -lt 1 ]]; then
  fail "QUBITOR_BOOTNODE_PUBLIC_HOSTS, QUBITOR_TESTNET_SERVER_HOSTS, QUBITOR_TESTNET_SERVER_HOST, QUBITOR_TESTNET_BOOTNODE_2_HOST, or QUBITOR_BOOTNODE_PUBLIC_IP must provide at least one host"
fi
if [[ "${#BOOTNODE_TCP_PORTS[@]}" -lt 1 ]]; then
  fail "QUBITOR_BOOTNODE_TCP_PORTS or QUBITOR_BOOTNODE_TCP_PORT must provide at least one port"
fi
if [[ -z "$BOOTNODE_COUNT" ]]; then
  BOOTNODE_COUNT="${#BOOTNODE_HOSTS[@]}"
fi
case "$BOOTNODE_COUNT" in
  ''|*[!0-9]*) fail "QUBITOR_BOOTNODE_COUNT must be a positive integer" ;;
esac
if [[ "$BOOTNODE_COUNT" -lt 1 ]]; then
  fail "QUBITOR_BOOTNODE_COUNT must be at least 1"
fi
case "$BOOTNODE_MIN_COUNT" in
  ''|*[!0-9]*) fail "QUBITOR_BOOTNODE_MIN_COUNT must be a positive integer" ;;
esac
if [[ "$BOOTNODE_MIN_COUNT" -lt 1 ]]; then
  fail "QUBITOR_BOOTNODE_MIN_COUNT must be at least 1"
fi
if [[ "${#BOOTNODE_HOSTS[@]}" -ne 1 && "${#BOOTNODE_HOSTS[@]}" -ne "$BOOTNODE_COUNT" ]]; then
  fail "QUBITOR_BOOTNODE_PUBLIC_HOSTS must have either one host or exactly QUBITOR_BOOTNODE_COUNT hosts"
fi
if [[ "${#BOOTNODE_TCP_PORTS[@]}" -ne 1 && "${#BOOTNODE_TCP_PORTS[@]}" -ne "$BOOTNODE_COUNT" ]]; then
  fail "QUBITOR_BOOTNODE_TCP_PORTS must have either one port or exactly QUBITOR_BOOTNODE_COUNT ports"
fi
if [[ "${#BOOTNODE_UDP_PORTS[@]}" -ne 0 && "${#BOOTNODE_UDP_PORTS[@]}" -ne 1 && "${#BOOTNODE_UDP_PORTS[@]}" -ne "$BOOTNODE_COUNT" ]]; then
  fail "QUBITOR_BOOTNODE_UDP_PORTS must have either one port or exactly QUBITOR_BOOTNODE_COUNT ports"
fi
for host in "${BOOTNODE_HOSTS[@]}"; do
  [[ -n "$host" ]] || fail "bootnode host must not be empty"
done
for port in "${BOOTNODE_TCP_PORTS[@]}"; do
  validate_port "QUBITOR_BOOTNODE_TCP_PORTS" "$port"
done
for port in "${BOOTNODE_UDP_PORTS[@]}"; do
  validate_port "QUBITOR_BOOTNODE_UDP_PORTS" "$port"
done

require_command go
require_command node
require_command pnpm

mkdir -p "$KEY_DIR" "$NODE_ENV_DIR"
chmod 700 "$OUT_DIR" "$KEY_DIR" "$NODE_ENV_DIR"

PQ_SERVICE_KEYS_JSON="$(
  cd "$ROOT_DIR"
  pnpm --filter @qubitor/pq-native-tx exec tsx -e '
    import { randomBytes } from "node:crypto";
    import { deriveQubitorPQAccountAddress, generateMLDSA65KeyPair, bytesToHex, QUBITOR_ZERO_HASH } from "./src/index";

    function pqWallet(label) {
      const seed = bytesToHex(randomBytes(32));
      const keypair = generateMLDSA65KeyPair(seed);
      return {
        label,
        seed,
        publicKey: keypair.publicKey,
        address: deriveQubitorPQAccountAddress(keypair.publicKey, QUBITOR_ZERO_HASH),
        salt: QUBITOR_ZERO_HASH,
      };
    }

    const faucetTreasury = pqWallet("faucet-treasury-and-miner-rewards");
    console.log(JSON.stringify({
      faucetTreasury,
      minerRewards: {
        ...faucetTreasury,
        label: "miner-rewards-same-as-faucet-treasury",
        note: "Public testnet rehearsal mines directly to the PQ faucet treasury so no EOA bootstrap transfer is needed.",
      },
    }, null, 2));
  '
)"
printf '%s\n' "$PQ_SERVICE_KEYS_JSON" > "$SERVICE_KEYS_FILE"
chmod 600 "$SERVICE_KEYS_FILE"

pq_field() {
  local wallet="$1"
  local field="$2"
  node -e 'const fs = require("fs"); const wallets = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(wallets[process.argv[2]][process.argv[3]]);' "$SERVICE_KEYS_FILE" "$wallet" "$field"
}

FAUCET_ADDRESS="$(pq_field faucetTreasury address)"
FAUCET_PQ_SEED="$(pq_field faucetTreasury seed)"
MINER_ADDRESS="$(pq_field minerRewards address)"

BOOTNODES=()
BOOTNODE_ARGS=()
PRIMARY_TCP_PORT=""
PRIMARY_UDP_PORT=""
PRIMARY_HOST=""
resolve_host() {
  local index_zero="$1"
  if [[ "${#BOOTNODE_HOSTS[@]}" -eq 1 ]]; then
    printf '%s' "${BOOTNODE_HOSTS[0]}"
  else
    printf '%s' "${BOOTNODE_HOSTS[$index_zero]}"
  fi
}

resolve_port() {
  local ports_name="$1"
  local index_zero="$2"
  local -n ports="$ports_name"
  local base

  if [[ "${#ports[@]}" -eq 1 ]]; then
    base="${ports[0]}"
    if [[ "$BOOTNODE_COUNT" -gt 1 && "${#BOOTNODE_HOSTS[@]}" -eq 1 ]]; then
      printf '%s' "$((base + index_zero))"
    else
      printf '%s' "$base"
    fi
  else
    printf '%s' "${ports[$index_zero]}"
  fi
}

for index in $(seq 1 "$BOOTNODE_COUNT"); do
  index_zero=$((index - 1))
  host="$(resolve_host "$index_zero")"
  tcp_port="$(resolve_port BOOTNODE_TCP_PORTS "$index_zero")"
  if [[ "${#BOOTNODE_UDP_PORTS[@]}" -eq 0 ]]; then
    udp_port="$tcp_port"
  else
    udp_port="$(resolve_port BOOTNODE_UDP_PORTS "$index_zero")"
  fi
  validate_port "resolved bootnode TCP port" "$tcp_port"
  validate_port "resolved bootnode UDP port" "$udp_port"
  if [[ "$index" -eq 1 ]]; then
    PRIMARY_HOST="$host"
    PRIMARY_TCP_PORT="$tcp_port"
    PRIMARY_UDP_PORT="$udp_port"
  fi

  NODE_KEY_FILE="$KEY_DIR/bootnode-$index.key"
  run_devp2p key generate -- "$NODE_KEY_FILE"
  chmod 600 "$NODE_KEY_FILE"
  BOOTNODE="$(run_devp2p key to-enode -ip "$host" -tcp "$tcp_port" -udp "$udp_port" -- "$NODE_KEY_FILE")"
  BOOTNODES+=("$BOOTNODE")
  BOOTNODE_ARGS+=("$index" "$host" "$tcp_port" "$udp_port" "keys/bootnode-$index.key" "$BOOTNODE")
done

node - "$BOOTNODES_FILE" "${BOOTNODE_ARGS[@]}" <<'NODE'
const fs = require("fs");
const [file, ...rawNodes] = process.argv.slice(2);
if (rawNodes.length % 6 !== 0) {
  throw new Error("bootnode records must be index, host, tcp, udp, keyFile, enode tuples");
}
const nodes = [];
for (let i = 0; i < rawNodes.length; i += 6) {
  const [index, advertisedHost, tcpPort, udpPort, keyFile, enode] = rawNodes.slice(i, i + 6);
  nodes.push({
    index: Number(index),
    advertisedHost,
    tcpPort: Number(tcpPort),
    udpPort: Number(udpPort),
    keyFile,
    enode,
  });
}
const isLocal = nodes.every((node) => node.advertisedHost === "127.0.0.1" || node.advertisedHost === "localhost");
const manifest = {
  network: "testnet",
  chainId: 91338,
  status: isLocal ? "local-generated-not-public" : "host-generated-pending-preflight",
  generatedAt: new Date().toISOString(),
  bootnodeCount: nodes.length,
  bootnodes: nodes.map((node) => node.enode),
  nodes,
};
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
NODE

BOOTNODES_CSV="$(IFS=,; printf '%s' "${BOOTNODES[*]}")"
BOOTNODE_HOSTS_CSV="$(IFS=,; printf '%s' "${BOOTNODE_HOSTS[*]}")"
P2P_NAT=""
if [[ "$PRIMARY_HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  P2P_NAT="extip:$PRIMARY_HOST"
fi
PUBLIC_RPC_URL="${QUBITOR_PUBLIC_RPC_URL:-https://testrpc.qubitor.org}"
PUBLIC_EXPLORER_URL="${QUBITOR_PUBLIC_EXPLORER_URL:-https://testexplorer.qubitor.org}"
PUBLIC_FAUCET_URL="${QUBITOR_PUBLIC_FAUCET_URL:-https://testrpc.qubitor.org}"
PUBLIC_RPC_ALIASES="${QUBITOR_PUBLIC_RPC_ALIASES:-}"
PUBLIC_EXPLORER_ALIASES="${QUBITOR_PUBLIC_EXPLORER_ALIASES:-}"
PUBLIC_FAUCET_ALIASES="${QUBITOR_PUBLIC_FAUCET_ALIASES:-}"
FAUCET_TREASURY_VAULT="${QUBITOR_FAUCET_TREASURY_VAULT:-$FAUCET_ADDRESS}"

cat > "$ENV_FILE" <<ENV
# Generated Qubitor testnet material.
# Keep this file private. It contains a hot PQ faucet seed for testnet only.

QUBITOR_NETWORK=testnet
QUBITOR_NETWORK_ID=91338
QUBITOR_PUBLIC_TESTNET_CHAIN_ID=91338
QUBITOR_EOA_TXS=0
QUBITOR_GENESIS_FILE=clients/qubitor-node/config/testnet/genesis.json
QUBITOR_GENESIS_HOST_FILE=../clients/qubitor-node/config/testnet/genesis.json
QUBITOR_BOOTNODES_FILE=$OUT_DIR_REL/bootnodes.json
QUBITOR_PQ_SERVICE_KEYS_FILE=$OUT_DIR_REL/pq-service-keys.json
QUBITOR_NODEKEY_FILE=$OUT_DIR_REL/keys/bootnode-1.key
QUBITOR_NODEKEY_HOST_FILE=../$OUT_DIR_REL/keys/bootnode-1.key
QUBITOR_DOCKER_NODEKEY_FILE=/nodekey
QUBITOR_DISCOVERY=1
QUBITOR_BOOTNODE_COUNT=$BOOTNODE_COUNT
QUBITOR_BOOTNODE_MIN_COUNT=$BOOTNODE_MIN_COUNT
QUBITOR_BOOTNODE_PUBLIC_HOSTS=$BOOTNODE_HOSTS_CSV
QUBITOR_BOOTNODES=$BOOTNODES_CSV
QUBITOR_P2P_TCP_PORT=$PRIMARY_TCP_PORT
QUBITOR_P2P_UDP_PORT=$PRIMARY_UDP_PORT
QUBITOR_P2P_NAT=$P2P_NAT

QUBITOR_PUBLIC_RPC_URL=$PUBLIC_RPC_URL
QUBITOR_PUBLIC_EXPLORER_URL=$PUBLIC_EXPLORER_URL
QUBITOR_PUBLIC_FAUCET_URL=$PUBLIC_FAUCET_URL
QUBITOR_PUBLIC_RPC_ALIASES=$PUBLIC_RPC_ALIASES
QUBITOR_PUBLIC_EXPLORER_ALIASES=$PUBLIC_EXPLORER_ALIASES
QUBITOR_PUBLIC_FAUCET_ALIASES=$PUBLIC_FAUCET_ALIASES

QUBITOR_NODE_RPC_PORT=127.0.0.1:8545
QUBITOR_NODE_WS_PORT=127.0.0.1:8546
QUBITOR_RPC_GATEWAY_PORT=127.0.0.1:18545
QUBITOR_FAUCET_PORT=127.0.0.1:18546
QUBITOR_EXPLORER_PORT=127.0.0.1:18547
QUBITOR_PQ_RELAYER_PORT=127.0.0.1:18548
QUBITOR_INDEXER_PORT=127.0.0.1:18549
QUBITOR_INDEXER_POLL_MS=4000

QUBITOR_FAUCET_ADDRESS=$FAUCET_ADDRESS
QUBITOR_FAUCET_PQ_SEED=$FAUCET_PQ_SEED
QUBITOR_MINER_ETHERBASE=$MINER_ADDRESS

QUBITOR_FAUCET_AMOUNT_WEI=1000000000000000000
QUBITOR_FAUCET_TREASURY_MODE=pq-controlled-testnet
QUBITOR_FAUCET_TREASURY_VAULT=$FAUCET_TREASURY_VAULT
QUBITOR_PROOF_PACK_DIR=artifacts/proofs/testnet
ENV
chmod 600 "$ENV_FILE"

for index in $(seq 1 "$BOOTNODE_COUNT"); do
  index_zero=$((index - 1))
  node_host="$(resolve_host "$index_zero")"
  node_tcp_port="$(resolve_port BOOTNODE_TCP_PORTS "$index_zero")"
  if [[ "${#BOOTNODE_UDP_PORTS[@]}" -eq 0 ]]; then
    node_udp_port="$node_tcp_port"
  else
    node_udp_port="$(resolve_port BOOTNODE_UDP_PORTS "$index_zero")"
  fi
  node_nat=""
  if [[ "$node_host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    node_nat="extip:$node_host"
  fi
cat > "$NODE_ENV_DIR/bootnode-$index.env" <<ENV
# Node-specific Qubitor testnet overrides for bootnode $index.
# Source this after .env.testnet.local on the matching server.
QUBITOR_NODEKEY_FILE=$OUT_DIR_REL/keys/bootnode-$index.key
QUBITOR_NODEKEY_HOST_FILE=../$OUT_DIR_REL/keys/bootnode-$index.key
QUBITOR_DOCKER_NODEKEY_FILE=/nodekey
QUBITOR_P2P_TCP_PORT=$node_tcp_port
QUBITOR_P2P_UDP_PORT=$node_udp_port
QUBITOR_P2P_NAT=$node_nat
QUBITOR_NODE_RPC_PORT=127.0.0.1:8545
QUBITOR_NODE_WS_PORT=127.0.0.1:8546
QUBITOR_MINER_ETHERBASE=$MINER_ADDRESS
ENV
  chmod 600 "$NODE_ENV_DIR/bootnode-$index.env"
done

cat > "$OUT_DIR/README.md" <<EOF
# Qubitor Testnet Launch Material

Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)

Files:

- \`.env.testnet.local\`: generated runtime environment. Contains a hot PQ faucet seed for testnet only.
- \`pq-service-keys.json\`: generated PQ wallet material for faucet treasury and miner rewards. No EOA private keys are generated.
- \`bootnodes.json\`: bootnode manifest.
- \`keys/bootnode-*.key\`: devp2p node keys. Keep private.
- \`node-env/bootnode-*.env\`: node-specific nodekey and P2P overrides. Source the matching file after \`.env.testnet.local\` on each bootnode host.

Run preflight with:

\`\`\`sh
QUBITOR_TESTNET_ENV_FILE=$ENV_FILE pnpm testnet:launch-preflight
\`\`\`

If this material was generated without public HTTPS URLs or public bootnode endpoints, preflight is expected to fail until those values are replaced. By default, the miner rewards address is the generated PQ faucet treasury so mining funds the faucet without any EOA bootstrap transfer.
EOF

echo "[qubitor-testnet-material] wrote $OUT_DIR"
echo "[qubitor-testnet-material] env $ENV_FILE"
echo "[qubitor-testnet-material] bootnodes $BOOTNODES_FILE"
echo "[qubitor-testnet-material] pq service keys $SERVICE_KEYS_FILE"
echo "[qubitor-testnet-material] keep this directory private; it contains testnet hot PQ material"
