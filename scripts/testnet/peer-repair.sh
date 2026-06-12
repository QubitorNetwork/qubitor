#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/testnet/server-access-lib.sh
source "$ROOT_DIR/scripts/testnet/server-access-lib.sh"

EXPECTED_GENESIS_HASH="${QUBITOR_EXPECTED_GENESIS_HASH:-0x8c422f1572daf17ff4b699c98db0b1d72a71bf9ef0f8cb926b1a15b4a3f33483}"
EXPECTED_CHAIN_ID="${QUBITOR_EXPECTED_CHAIN_ID:-0x164ca}"
MIN_PEERS="${QUBITOR_MIN_PEERS_BEFORE_MINE:-1}"
MAX_HEIGHT_LAG="${QUBITOR_PEER_REPAIR_MAX_HEIGHT_LAG:-24}"
FINALITY_DEPTH="${QUBITOR_PEER_REPAIR_FINALITY_DEPTH:-12}"
TIMEOUT_SECONDS="${QUBITOR_PEER_REPAIR_TIMEOUT_SECONDS:-900}"
POLL_SECONDS="${QUBITOR_PEER_REPAIR_POLL_SECONDS:-5}"
DRY_RUN="${QUBITOR_PEER_REPAIR_DRY_RUN:-0}"

PRIMARY_ENODE="enode://39214e35a86ef628de4c359aa5778c9baa0c053f95886d215d8f51d4f17151a02af63f187fce06083fe5e0b151a9e3a2accc71d1312d72d2a989facf66e5012c@bootnode-1.testnet.qubitor.org:30303"
SECONDARY_ENODE="enode://59b33be8ed0165c35f508971e7d08c84168d1d8f8e9927bf332c19b4b0d0275ee758c883b035a2271395c7cf968a582f6e59f407fcaa1c6b7ee84001d96b4a10@bootnode-2.testnet.qubitor.org:30303"

fail() {
  echo "[qubitor-peer-repair] $*" >&2
  exit 1
}

require_contains() {
  local file="$1" pattern="$2"
  grep -Fq -- "$pattern" "$file" || fail "${file#$ROOT_DIR/} must contain: $pattern"
}

reject_contains() {
  local file="$1" pattern="$2"
  if grep -Fq -- "$pattern" "$file"; then
    fail "${file#$ROOT_DIR/} must not contain: $pattern"
  fi
}

usage() {
  cat >&2 <<'EOF'
usage: pnpm testnet:peer-repair [status|repair|install-guard]

No-reset peering repair for the public Qubitor testnet.

Commands:
  status         Read-only status, fork sample, peers, and total difficulty.
  repair         Stop unsafe mining, add official peers, wait for convergence, resume mining.
  install-guard  Sync code and start the peer-guard service on both official hosts.

Safety:
  - never runs geth init
  - never deletes, moves, or rewrites data/node/testnet
  - only uses local admin RPC to stop/start mining and add peers
EOF
}

json_escape() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"
}

rpc_target() {
  local target="$1" method="$2" params="${3:-[]}" payload
  payload="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}"
  ssh_run_target "$target" "curl -fsS -H 'content-type: application/json' --data $(shell_quote "$payload") http://127.0.0.1:8545"
}

rpc_result() {
  node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(0,"utf8")); if (p.error) { console.error(JSON.stringify(p.error)); process.exit(1); } process.stdout.write(JSON.stringify(p.result));'
}

collect_target() {
  local target="$1" out="$2" head_json head latest_json genesis_json peer_json mining_json sync_json info_json peers_json
  info_json="$(rpc_target "$target" admin_nodeInfo | rpc_result)"
  peers_json="$(rpc_target "$target" admin_peers | rpc_result)"
  head_json="$(rpc_target "$target" eth_blockNumber | rpc_result)"
  head="$(node -e 'console.log(Number(BigInt(JSON.parse(process.argv[1]))))' "$head_json")"
  latest_json="$(rpc_target "$target" eth_getBlockByNumber "[$head_json,false]" | rpc_result)"
  genesis_json="$(rpc_target "$target" eth_getBlockByNumber '["0x0",false]' | rpc_result)"
  peer_json="$(rpc_target "$target" net_peerCount | rpc_result)"
  mining_json="$(rpc_target "$target" eth_mining | rpc_result)"
  sync_json="$(rpc_target "$target" eth_syncing | rpc_result)"

  node - "$target" "$head" "$info_json" "$peers_json" "$head_json" "$latest_json" "$genesis_json" "$peer_json" "$mining_json" "$sync_json" > "$out" <<'NODE'
const [target, head, infoRaw, peersRaw, headHexRaw, latestRaw, genesisRaw, peerRaw, miningRaw, syncRaw] = process.argv.slice(2);
const info = JSON.parse(infoRaw);
const peers = JSON.parse(peersRaw);
const latest = JSON.parse(latestRaw);
const genesis = JSON.parse(genesisRaw);
const peerHex = JSON.parse(peerRaw);
const mining = JSON.parse(miningRaw);
const syncing = JSON.parse(syncRaw);
const headHex = JSON.parse(headHexRaw);
const hexToNumber = (value) => Number(BigInt(value || "0x0"));
const totalDifficulty = BigInt(latest?.totalDifficulty || "0x0").toString();
console.log(JSON.stringify({
  target,
  head: Number(head),
  headHex,
  headHash: latest?.hash,
  totalDifficulty,
  difficulty: latest?.difficulty,
  miner: latest?.miner,
  peerCount: hexToNumber(peerHex),
  mining,
  syncing,
  nodeId: String(info?.id || "").toLowerCase(),
  enode: info?.enode,
  advertisedNetwork: info?.protocols?.eth?.network,
  genesisHash: String(genesis?.hash || "").toLowerCase(),
  protocolGenesis: String(info?.protocols?.eth?.genesis || "").toLowerCase(),
  peers: Array.isArray(peers) ? peers.map((peer) => ({
    id: peer.id,
    name: peer.name,
    enode: peer.enode,
    remoteAddress: peer.network?.remoteAddress,
    inbound: peer.network?.inbound,
    static: peer.network?.static,
    trusted: peer.network?.trusted,
    head: peer.protocols?.eth?.head,
    difficulty: peer.protocols?.eth?.difficulty,
  })) : [],
}, null, 2));
NODE
}

collect_all() {
  local dir="$1"
  mkdir -p "$dir"
  collect_target primary "$dir/primary.json"
  collect_target secondary "$dir/secondary.json"
  node - "$dir" "$EXPECTED_GENESIS_HASH" "$EXPECTED_CHAIN_ID" <<'NODE'
const fs = require("fs");
const [dir, expectedGenesis, expectedChainId] = process.argv.slice(2);
const statuses = ["primary", "secondary"].map((target) => JSON.parse(fs.readFileSync(`${dir}/${target}.json`, "utf8")));
for (const status of statuses) {
  status.genesisOk = status.genesisHash === expectedGenesis.toLowerCase();
  status.protocolGenesisOk = status.protocolGenesis === expectedGenesis.toLowerCase();
  status.chainOk = status.advertisedNetwork === 91338 || expectedChainId === "0x164ca";
}
const canonical = [...statuses].sort((a, b) => {
  const diff = BigInt(b.totalDifficulty) - BigInt(a.totalDifficulty);
  if (diff > 0n) return 1;
  if (diff < 0n) return -1;
  return b.head - a.head;
})[0];
const summary = { checkedAt: new Date().toISOString(), canonicalTarget: canonical.target, statuses };
fs.writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
NODE
}

summary_value() {
  local dir="$1" expr="$2"
  node -e "const s=require(process.argv[1]); console.log($expr)" "$dir/summary.json"
}

target_td() {
  local dir="$1" target="$2"
  node -e 'const s=require(process.argv[1]); const t=s.statuses.find((x)=>x.target===process.argv[2]); console.log(t.totalDifficulty)' "$dir/summary.json" "$target"
}

target_peer_count() {
  local dir="$1" target="$2"
  node -e 'const s=require(process.argv[1]); const t=s.statuses.find((x)=>x.target===process.argv[2]); console.log(t.peerCount)' "$dir/summary.json" "$target"
}

target_head() {
  local dir="$1" target="$2"
  node -e 'const s=require(process.argv[1]); const t=s.statuses.find((x)=>x.target===process.argv[2]); console.log(t.head)' "$dir/summary.json" "$target"
}

target_mining() {
  local dir="$1" target="$2"
  node -e 'const s=require(process.argv[1]); const t=s.statuses.find((x)=>x.target===process.argv[2]); console.log(t.mining ? "1" : "0")' "$dir/summary.json" "$target"
}

validate_statuses() {
  local dir="$1"
  node - "$dir/summary.json" "$EXPECTED_GENESIS_HASH" <<'NODE'
const fs = require("fs");
const [file, expectedGenesis] = process.argv.slice(2);
const summary = JSON.parse(fs.readFileSync(file, "utf8"));
const failures = [];
for (const status of summary.statuses) {
  if (status.genesisHash !== expectedGenesis.toLowerCase()) failures.push(`${status.target}: genesis mismatch ${status.genesisHash}`);
  if (status.protocolGenesis !== expectedGenesis.toLowerCase()) failures.push(`${status.target}: protocol genesis mismatch ${status.protocolGenesis}`);
  if (status.advertisedNetwork !== 91338) failures.push(`${status.target}: network ${status.advertisedNetwork} != 91338`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
NODE
}

stop_mining() {
  local target="$1"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[qubitor-peer-repair] dry-run: would stop mining on $target"
    return
  fi
  echo "[qubitor-peer-repair] stopping mining on $target"
  rpc_target "$target" miner_stop >/dev/null
}

start_mining() {
  local target="$1"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[qubitor-peer-repair] dry-run: would start mining on $target"
    return
  fi
  echo "[qubitor-peer-repair] starting mining on $target"
  rpc_target "$target" miner_start "[]" >/dev/null
}

add_peer() {
  local target="$1" enode="$2" escaped params
  escaped="$(json_escape "$enode")"
  params="[$escaped]"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[qubitor-peer-repair] dry-run: would add peer on $target: $enode"
    return
  fi
  echo "[qubitor-peer-repair] adding static/trusted peer on $target"
  rpc_target "$target" admin_addPeer "$params" >/dev/null || true
  rpc_target "$target" admin_addTrustedPeer "$params" >/dev/null || true
}

hash_at_target() {
  local target="$1" number="$2" tag block_json
  tag="0x$(printf '%x' "$number")"
  block_json="$(rpc_target "$target" eth_getBlockByNumber "[\"$tag\",false]" | rpc_result)"
  node -e 'const b=JSON.parse(process.argv[1]); console.log((b && b.hash) || "")' "$block_json"
}

converged() {
  local dir="$1" primary_head secondary_head sample primary_hash secondary_hash primary_peers secondary_peers lag
  primary_head="$(target_head "$dir" primary)"
  secondary_head="$(target_head "$dir" secondary)"
  primary_peers="$(target_peer_count "$dir" primary)"
  secondary_peers="$(target_peer_count "$dir" secondary)"

  if (( primary_peers < MIN_PEERS || secondary_peers < MIN_PEERS )); then
    return 1
  fi

  if (( primary_head > secondary_head )); then
    lag=$(( primary_head - secondary_head ))
    sample="$secondary_head"
  else
    lag=$(( secondary_head - primary_head ))
    sample="$primary_head"
  fi
  if (( lag > MAX_HEIGHT_LAG )); then
    return 1
  fi
  sample=$(( sample - FINALITY_DEPTH ))
  if (( sample < 0 )); then
    sample=0
  fi

  primary_hash="$(hash_at_target primary "$sample")"
  secondary_hash="$(hash_at_target secondary "$sample")"
  [[ -n "$primary_hash" && "$primary_hash" == "$secondary_hash" ]]
}

status_command() {
  local tmp
  tmp="$(mktemp -d)"
  collect_all "$tmp"
  echo "[qubitor-peer-repair] evidence written to $tmp"
}

repair_command() {
  local tmp canonical max_td target td peers mining started_at now
  tmp="$(mktemp -d)"
  echo "[qubitor-peer-repair] collecting pre-repair evidence"
  collect_all "$tmp"
  validate_statuses "$tmp"

  canonical="$(summary_value "$tmp" "s.canonicalTarget")"
  max_td="$(target_td "$tmp" "$canonical")"
  echo "[qubitor-peer-repair] canonical candidate by total difficulty: $canonical"

  for target in primary secondary; do
    td="$(target_td "$tmp" "$target")"
    peers="$(target_peer_count "$tmp" "$target")"
    mining="$(target_mining "$tmp" "$target")"
    if [[ "$mining" == "1" ]] && { [[ "$td" != "$max_td" ]] || (( peers < MIN_PEERS )); }; then
      stop_mining "$target"
    fi
  done

  add_peer primary "$SECONDARY_ENODE"
  add_peer secondary "$PRIMARY_ENODE"

  started_at="$(date +%s)"
  while true; do
    collect_all "$tmp" >/dev/null
    if converged "$tmp"; then
      echo "[qubitor-peer-repair] official nodes converged"
      break
    fi
    now="$(date +%s)"
    if (( now - started_at > TIMEOUT_SECONDS )); then
      echo "[qubitor-peer-repair] convergence timed out; leaving unsafe mining stopped" >&2
      cat "$tmp/summary.json"
      exit 1
    fi
    sleep "$POLL_SECONDS"
  done

  for target in primary secondary; do
    peers="$(target_peer_count "$tmp" "$target")"
    mining="$(target_mining "$tmp" "$target")"
    if (( peers >= MIN_PEERS )) && [[ "$mining" != "1" ]]; then
      start_mining "$target"
    fi
  done

  collect_all "$tmp"
  echo "[qubitor-peer-repair] final evidence written to $tmp"
}

remote_cd_command() {
  if [[ "$REMOTE_ROOT" == /* ]]; then
    printf 'cd %s\n' "$(shell_quote "$REMOTE_ROOT")"
  else
    printf 'if [ -d "$HOME/%s" ]; then cd "$HOME/%s"; else cd %s; fi\n' \
      "$(shell_quote "$REMOTE_ROOT")" \
      "$(shell_quote "$REMOTE_ROOT")" \
      "$(shell_quote "$REMOTE_ROOT")"
  fi
}

install_guard_target() {
  local target="$1" node_env
  case "$target" in
    primary) node_env="node-env/bootnode-1.env" ;;
    secondary) node_env="node-env/bootnode-2.env" ;;
    *) fail "unknown target: $target" ;;
  esac
  echo "[qubitor-peer-repair] syncing code to $target and starting peer-guard"
  rsync_repo_to_target "$target"
  ssh_run_target "$target" "$(cat <<REMOTE
set -euo pipefail
$(remote_cd_command)
latest=\$(find artifacts/testnet/launch -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | awk 'NR == 1 {print \$2}')
test -n "\$latest"
test -f "\$latest/.env.testnet.local"
test -f "\$latest/$node_env"
set -a
. "\$latest/.env.testnet.local"
. "\$latest/$node_env"
set +a
export QUBITOR_REQUIRED_PEERS=\${QUBITOR_REQUIRED_PEERS:-$PRIMARY_ENODE,$SECONDARY_ENODE}
export QUBITOR_MIN_PEERS_BEFORE_MINE=\${QUBITOR_MIN_PEERS_BEFORE_MINE:-$MIN_PEERS}
export QUBITOR_EXPECTED_GENESIS_HASH=\${QUBITOR_EXPECTED_GENESIS_HASH:-$EXPECTED_GENESIS_HASH}
export QUBITOR_EXPECTED_CHAIN_ID=\${QUBITOR_EXPECTED_CHAIN_ID:-$EXPECTED_CHAIN_ID}
COMPOSE="docker compose -f infra/docker-compose.yml -f infra/docker-compose.testnet.yml -f infra/docker-compose.public.yml"
corepack enable >/dev/null 2>&1 || true
CI=true pnpm install --frozen-lockfile
\$COMPOSE --profile all up -d --build --no-deps --force-recreate peer-guard
REMOTE
)"
}

install_guard_command() {
  require_contains "$ROOT_DIR/infra/docker-compose.yml" "peer-guard"
  require_contains "$ROOT_DIR/infra/docker-compose.yml" "scripts/testnet/peer-guard.mjs"
  require_contains "$ROOT_DIR/scripts/testnet/server-access-lib.sh" "--exclude .env.testnet"
  require_contains "$ROOT_DIR/scripts/testnet/server-access-lib.sh" "--exclude data"
  reject_contains "$ROOT_DIR/scripts/testnet/server-access-lib.sh" "rm -rf data/node/testnet"
  reject_contains "$ROOT_DIR/scripts/testnet/server-access-lib.sh" "geth init --datadir=/data /genesis.json"
  install_guard_target primary
  install_guard_target secondary
}

main() {
  local command="${1:-repair}"
  if [[ "$command" == "-h" || "$command" == "--help" ]]; then
    usage
    exit 0
  fi
  load_testnet_access_env
  case "$command" in
    status) status_command ;;
    repair) repair_command ;;
    install-guard) install_guard_command ;;
    *) usage; fail "unknown command: $command" ;;
  esac
}

main "$@"
