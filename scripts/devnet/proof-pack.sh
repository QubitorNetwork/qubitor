#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NETWORK="${QUBITOR_NETWORK:-${QUBITOR_NETWORK_PROFILE:-devnet}}"
EXPLORER_URL="${QUBITOR_EXPLORER_URL:-http://127.0.0.1:18547}"
GATEWAY_RPC_URL="${QUBITOR_RPC_GATEWAY_URL:-http://127.0.0.1:18545/rpc}"
INDEXER_URL="${QUBITOR_INDEXER_URL:-http://127.0.0.1:18549}"
ARTIFACT_ROOT="${QUBITOR_PROOF_PACK_DIR:-$ROOT_DIR/artifacts/proofs/$NETWORK}"
DEPLOYMENTS_FILE="${QUBITOR_DEPLOYMENTS_FILE:-$ROOT_DIR/contracts/deployments/$NETWORK/deployments.json}"

fail() {
  echo "[qubitor-proof-pack] $*" >&2
  exit 1
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    fail "$name is required"
  fi
}

wait_for_indexer() {
  local status=""
  local transaction_count="0"
  local event_count="0"
  for _ in $(seq 1 120); do
    status="$(curl -fsS "$INDEXER_URL/indexer/status" 2>/dev/null || true)"
    transaction_count="$(node -e 'try { const s = JSON.parse(process.argv[1] || "{}"); console.log(Number(s.transactionCount || 0)); } catch { console.log(0); }' "$status")"
    event_count="$(node -e 'try { const s = JSON.parse(process.argv[1] || "{}"); console.log(Number(s.eventCount || 0)); } catch { console.log(0); }' "$status")"
    if [[ "$transaction_count" -gt 0 && "$event_count" -gt 0 ]]; then
      printf '%s' "$status"
      return 0
    fi
    sleep 1
  done
  fail "indexer did not become ready with transactions and events"
}

extract_pq_account() {
  node -e 'let d = ""; process.stdin.on("data", (c) => d += c); process.stdin.on("end", () => { const p = JSON.parse(d); const account = [...(p.accounts || [])].reverse().find((a) => (a.executions || []).length > 0); console.log(account?.address || ""); });'
}

extract_faucet_tx() {
  node -e 'let d = ""; process.stdin.on("data", (c) => d += c); process.stdin.on("end", () => { const p = JSON.parse(d); const claim = [...(p.claims || [])].reverse().find((c) => c.hasPriorPQTreasuryTopUp || c.hasPriorPoWMinerReward); console.log(claim?.txHash || ""); });'
}

extract_admin_vault() {
  node -e 'let d = ""; process.stdin.on("data", (c) => d += c); process.stdin.on("end", () => { const p = JSON.parse(d); const vault = [...(p.vaults || [])].reverse().find((v) => (v.actions || []).some((a) => a.type === "PolicyRecorded") && (v.actions || []).some((a) => a.type === "TreasuryTransferred")); console.log(vault?.vault || ""); });'
}

write_manifest() {
  node --input-type=module - \
    "$PACK_DIR" \
    "$NETWORK" \
    "$GATEWAY_RPC_URL" \
    "$INDEXER_URL" \
    "$EXPLORER_URL" \
    "$DEPLOYMENTS_FILE" \
    "$INDEXER_STATUS_FILE" \
    "$VERIFIER_REPORT_FILE" \
    "$PQ_BUNDLE_FILE" \
    "$FAUCET_BUNDLE_FILE" \
    "$ADMIN_BUNDLE_FILE" \
    "$ACCEPTANCE_SUMMARY_FILE" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [
  packDir,
  networkName,
  rpcUrl,
  indexerUrl,
  explorerUrl,
  deploymentsFile,
  indexerStatusFile,
  verifierReportFile,
  pqBundleFile,
  faucetBundleFile,
  adminBundleFile,
  acceptanceSummaryFile,
] = process.argv.slice(2);

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const maybeReadJson = (file) => {
  try {
    return readJson(file);
  } catch {
    return {};
  }
};
const basename = (file) => path.basename(file);
const first = (items) => Array.isArray(items) ? items[0] : undefined;
const last = (items) => Array.isArray(items) ? items[items.length - 1] : undefined;
const blockHashes = (bundle) => [...new Set((bundle.evidence?.blocks || []).map((block) => block.hash).filter(Boolean))];
const txHashes = (bundle) => [...new Set((bundle.evidence?.transactions || []).map((tx) => tx.hash).filter(Boolean))];
const eventTopics = (bundle) => [...new Set((bundle.evidence?.events || []).map((event) => event.eventTopic).filter(Boolean))];
const summaryLine = (label, bundle) => `${label}: ${bundle.subject} (${bundle.evidence?.blocks?.length || 0} blocks, ${bundle.evidence?.transactions?.length || 0} txs, ${bundle.evidence?.events?.length || 0} events)`;

const pqBundle = readJson(pqBundleFile);
const faucetBundle = readJson(faucetBundleFile);
const adminBundle = readJson(adminBundleFile);
const verifierReport = readJson(verifierReportFile);
const deployments = maybeReadJson(deploymentsFile);
const indexerStatus = readJson(indexerStatusFile);

const proofBundles = [
  { id: "pq-account", file: basename(pqBundleFile), bundle: pqBundle },
  { id: "faucet-claim", file: basename(faucetBundleFile), bundle: faucetBundle },
  { id: "admin-vault", file: basename(adminBundleFile), bundle: adminBundle },
];

const manifest = {
  proofPackVersion: `qbt-${networkName}-proof-pack-v1`,
  generatedAt: new Date().toISOString(),
  network: networkName,
  exactClaim: pqBundle.exactClaim,
  compatibilityBoundary: pqBundle.compatibilityBoundary,
  status: verifierReport.ok === true ? "verified" : "failed",
  chain: pqBundle.chain,
  rpcUrl,
  indexerUrl,
  explorerUrl,
  deployments,
  indexerStatus,
  verifier: {
    command: `pnpm proofs:verify --json --rpc ${rpcUrl} --bundle ${basename(pqBundleFile)} --bundle ${basename(faucetBundleFile)} --bundle ${basename(adminBundleFile)}`,
    reportFile: basename(verifierReportFile),
    ok: verifierReport.ok === true,
    results: verifierReport.results || [],
  },
  proofs: proofBundles.map(({ id, file, bundle }) => ({
    id,
    file,
    proofType: bundle.proofType,
    subject: bundle.subject,
    summary: bundle.summary,
    blockHashes: blockHashes(bundle),
    transactionHashes: txHashes(bundle),
    eventTopics: eventTopics(bundle),
    firstBlock: first(bundle.evidence?.blocks)?.number,
    lastBlock: last(bundle.evidence?.blocks)?.number,
  })),
};

const acceptanceSummary = [
  `Qubitor ${networkName} Proof Pack`,
  `Generated: ${manifest.generatedAt}`,
  `Status: ${manifest.status}`,
  `Chain: ${manifest.chain?.name || "unknown"} (${manifest.chain?.chainId || "unknown"})`,
  `RPC: ${rpcUrl}`,
  `Claim: ${manifest.exactClaim}`,
  `Boundary: ${manifest.compatibilityBoundary}`,
  "",
  summaryLine("PQ account", pqBundle),
  summaryLine("Faucet claim", faucetBundle),
  summaryLine("Admin vault", adminBundle),
  "",
  `Verifier report: ${basename(verifierReportFile)}`,
  "Manifest: manifest.json",
  "",
  "Verifier results:",
  ...(verifierReport.results || []).map((result) =>
    `- ${result.ok ? "ok" : "failed"} ${result.proofType || "unknown"} ${result.subject || result.bundle || ""} checks=${result.checkCount || 0}`
  ),
  "",
].join("\n");

writeFileSync(path.join(packDir, "manifest.json"), JSON.stringify(manifest, null, 2));
writeFileSync(acceptanceSummaryFile, acceptanceSummary);
NODE
}

require_command curl
require_command node
require_command pnpm

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
PACK_DIR="$ARTIFACT_ROOT/$TIMESTAMP"
mkdir -p "$PACK_DIR"

INDEXER_STATUS_FILE="$PACK_DIR/indexer-status.json"
VERIFIER_REPORT_FILE="$PACK_DIR/verifier-report.json"
PQ_BUNDLE_FILE="$PACK_DIR/pq-account-proof.json"
FAUCET_BUNDLE_FILE="$PACK_DIR/faucet-claim-proof.json"
ADMIN_BUNDLE_FILE="$PACK_DIR/admin-vault-proof.json"
ACCEPTANCE_SUMMARY_FILE="$PACK_DIR/acceptance-summary.txt"

echo "[qubitor-proof-pack] writing $PACK_DIR"
INDEXER_STATUS="$(wait_for_indexer)"
printf '%s\n' "$INDEXER_STATUS" > "$INDEXER_STATUS_FILE"

PQ_JSON="$(curl -fsS "$INDEXER_URL/proofs/pq-accounts")"
PQ_ACCOUNT="$(printf '%s' "$PQ_JSON" | extract_pq_account)"
[[ -n "$PQ_ACCOUNT" ]] || fail "PQ account proof API did not return an account with ExecutedPQ"
curl -fsS "$INDEXER_URL/proofs/pq-accounts/$PQ_ACCOUNT?bundle=1" > "$PQ_BUNDLE_FILE"

FAUCET_JSON="$(curl -fsS "$INDEXER_URL/proofs/faucet")"
FAUCET_TX="$(printf '%s' "$FAUCET_JSON" | extract_faucet_tx)"
[[ -n "$FAUCET_TX" ]] || fail "faucet proof API did not return a claim with PQ treasury funding evidence"
curl -fsS "$INDEXER_URL/proofs/faucet/$FAUCET_TX?bundle=1" > "$FAUCET_BUNDLE_FILE"

ADMIN_JSON="$(curl -fsS "$INDEXER_URL/proofs/admin-vaults")"
ADMIN_VAULT="$(printf '%s' "$ADMIN_JSON" | extract_admin_vault)"
[[ -n "$ADMIN_VAULT" ]] || fail "admin vault proof API did not return a vault with policy and treasury actions"
curl -fsS "$INDEXER_URL/proofs/admin-vaults/$ADMIN_VAULT?bundle=1" > "$ADMIN_BUNDLE_FILE"

pnpm --silent proofs:verify \
  --json \
  --rpc "$GATEWAY_RPC_URL" \
  --bundle "$PQ_BUNDLE_FILE" \
  --bundle "$FAUCET_BUNDLE_FILE" \
  --bundle "$ADMIN_BUNDLE_FILE" > "$VERIFIER_REPORT_FILE"

write_manifest

echo "[qubitor-proof-pack] ok $PACK_DIR"
