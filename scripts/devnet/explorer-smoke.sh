#!/usr/bin/env bash
set -euo pipefail

EXPLORER_URL="${QUBITOR_EXPLORER_URL:-http://127.0.0.1:18547}"
GATEWAY_RPC_URL="${QUBITOR_RPC_GATEWAY_URL:-http://127.0.0.1:18545/rpc}"
INDEXER_URL="${QUBITOR_INDEXER_URL:-http://127.0.0.1:18549}"
LEGACY_ADDRESS="${QUBITOR_EXPLORER_LEGACY_ADDRESS:-0x70997970c51812dc3a010c7d01b50e0d17dc79c8}"
CLAIM="Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts."
BUNDLE_DIR="$(mktemp -d)"
trap 'rm -rf "$BUNDLE_DIR"' EXIT

fail() {
  echo "[qubitor-explorer-smoke] $*" >&2
  exit 1
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    fail "$name is required"
  fi
}

require_contains() {
  local label="$1"
  local body="$2"
  local pattern="$3"
  [[ "$body" == *"$pattern"* ]] || fail "$label must contain: $pattern"
}

require_command curl
require_command node
require_command pnpm

INDEXER_STATUS=""
for _ in $(seq 1 120); do
  INDEXER_STATUS="$(curl -fsS "$INDEXER_URL/indexer/status" 2>/dev/null || true)"
  TRANSACTION_COUNT="$(node -e 'try { const s = JSON.parse(process.argv[1] || "{}"); console.log(Number(s.transactionCount || 0)); } catch { console.log(0); }' "$INDEXER_STATUS")"
  EVENT_COUNT="$(node -e 'try { const s = JSON.parse(process.argv[1] || "{}"); console.log(Number(s.eventCount || 0)); } catch { console.log(0); }' "$INDEXER_STATUS")"
  if [[ "$TRANSACTION_COUNT" -gt 0 && "$EVENT_COUNT" -gt 0 ]]; then
    break
  fi
  sleep 1
done

require_contains "indexer status" "$INDEXER_STATUS" "\"transactionCount\""
require_contains "indexer status" "$INDEXER_STATUS" "\"eventCount\""
if [[ "$TRANSACTION_COUNT" -le 0 ]]; then
  fail "indexer did not observe any transactions"
fi
if [[ "$EVENT_COUNT" -le 0 ]]; then
  fail "indexer did not observe any Qubitor events"
fi

HOME_HTML="$(curl -fsS "$EXPLORER_URL/")"
require_contains "home page" "$HOME_HTML" "Default Account Control"
require_contains "home page" "$HOME_HTML" "Indexed Activity"
require_contains "home page" "$HOME_HTML" "PQ Account Proofs"
require_contains "home page" "$HOME_HTML" "PQ Native"
require_contains "home page" "$HOME_HTML" "ML-DSA Required"
require_contains "home page" "$HOME_HTML" "Faucet Treasury"
require_contains "home page" "$HOME_HTML" "Disabled in native mode"
require_contains "home page" "$HOME_HTML" "QBT_ML_DSA_65_VERIFY"
require_contains "home page" "$HOME_HTML" "$CLAIM"
require_contains "home page" "$HOME_HTML" "Control Surfaces"

ADDRESS_HTML="$(curl -fsS "$EXPLORER_URL/address/$LEGACY_ADDRESS")"
require_contains "legacy address page" "$ADDRESS_HTML" "$LEGACY_ADDRESS"
require_contains "legacy address page" "$ADDRESS_HTML" "Legacy / compatibility or undeployed counterfactual"
require_contains "legacy address page" "$ADDRESS_HTML" "Verified Qubitor Account"

STATUS_JSON="$(curl -fsS "$GATEWAY_RPC_URL" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"qubitor_getNetworkSecurityStatus","params":[]}')"
require_contains "network security RPC" "$STATUS_JSON" "PQ Native"
require_contains "network security RPC" "$STATUS_JSON" "QBT_ML_DSA_65_VERIFY"
require_contains "network security RPC" "$STATUS_JSON" "$CLAIM"
require_contains "network security RPC" "$STATUS_JSON" "faucet-gas-payer"

EVENTS_JSON="$(curl -fsS "$INDEXER_URL/events?limit=5")"
require_contains "indexer events" "$EVENTS_JSON" "events"

PQ_JSON="$(curl -fsS "$INDEXER_URL/proofs/pq-accounts")"
require_contains "PQ account proof API" "$PQ_JSON" "accounts"
require_contains "PQ account proof API" "$PQ_JSON" "ExecutedPQ"
PQ_ACCOUNT="$(node -e 'let d = ""; process.stdin.on("data", (c) => d += c); process.stdin.on("end", () => { const p = JSON.parse(d); const account = (p.accounts || []).find((a) => (a.executions || []).length > 0); console.log(account?.address || ""); });' <<< "$PQ_JSON")"
[[ -n "$PQ_ACCOUNT" ]] || fail "PQ account proof API did not return an account with ExecutedPQ"
PQ_BUNDLE="$(curl -fsS "$INDEXER_URL/proofs/pq-accounts/$PQ_ACCOUNT?bundle=1")"
PQ_BUNDLE_FILE="$BUNDLE_DIR/pq-account.json"
printf '%s' "$PQ_BUNDLE" > "$PQ_BUNDLE_FILE"
require_contains "PQ account proof bundle" "$PQ_BUNDLE" "$CLAIM"
require_contains "PQ account proof bundle" "$PQ_BUNDLE" "ExecutedPQ"
require_contains "PQ account proof bundle" "$PQ_BUNDLE" "eventTopic"
require_contains "PQ account proof bundle" "$PQ_BUNDLE" "blockHash"
PQ_HTML="$(curl -fsS "$EXPLORER_URL/proofs/pq-accounts")"
require_contains "PQ account proof page" "$PQ_HTML" "PQ Account Proofs"
require_contains "PQ account proof page" "$PQ_HTML" "executePQ"
PQ_DETAIL_HTML="$(curl -fsS "$EXPLORER_URL/proofs/pq-accounts/$PQ_ACCOUNT")"
require_contains "PQ account detail page" "$PQ_DETAIL_HTML" "Download JSON proof bundle"
require_contains "PQ account detail page" "$PQ_DETAIL_HTML" "JSON Proof Bundle"

FAUCET_JSON="$(curl -fsS "$INDEXER_URL/proofs/faucet")"
require_contains "faucet proof API" "$FAUCET_JSON" "claims"
require_contains "faucet proof API" "$FAUCET_JSON" "hasPQTreasuryTopUp"
FAUCET_TX="$(node -e 'let d = ""; process.stdin.on("data", (c) => d += c); process.stdin.on("end", () => { const p = JSON.parse(d); const claim = (p.claims || []).find((c) => c.hasPriorPQTreasuryTopUp); console.log(claim?.txHash || ""); });' <<< "$FAUCET_JSON")"
[[ -n "$FAUCET_TX" ]] || fail "faucet proof API did not return a claim with PQ treasury top-up"
FAUCET_BUNDLE="$(curl -fsS "$INDEXER_URL/proofs/faucet/$FAUCET_TX?bundle=1")"
FAUCET_BUNDLE_FILE="$BUNDLE_DIR/faucet-claim.json"
printf '%s' "$FAUCET_BUNDLE" > "$FAUCET_BUNDLE_FILE"
require_contains "faucet proof bundle" "$FAUCET_BUNDLE" "$CLAIM"
require_contains "faucet proof bundle" "$FAUCET_BUNDLE" "\"hasPriorPQTreasuryTopUp\": true"
require_contains "faucet proof bundle" "$FAUCET_BUNDLE" "transactionHash"
require_contains "faucet proof bundle" "$FAUCET_BUNDLE" "blockHash"
FAUCET_HTML="$(curl -fsS "$EXPLORER_URL/proofs/faucet")"
require_contains "faucet proof page" "$FAUCET_HTML" "Faucet Claims"
require_contains "faucet proof page" "$FAUCET_HTML" "PQ treasury top-up"
FAUCET_DETAIL_HTML="$(curl -fsS "$EXPLORER_URL/proofs/faucet/$FAUCET_TX")"
require_contains "faucet detail page" "$FAUCET_DETAIL_HTML" "Faucet Claim Proof"
require_contains "faucet detail page" "$FAUCET_DETAIL_HTML" "Download JSON proof bundle"

ADMIN_JSON="$(curl -fsS "$INDEXER_URL/proofs/admin-vaults")"
require_contains "admin vault proof API" "$ADMIN_JSON" "vaults"
require_contains "admin vault proof API" "$ADMIN_JSON" "PolicyRecorded"
ADMIN_VAULT="$(node -e 'let d = ""; process.stdin.on("data", (c) => d += c); process.stdin.on("end", () => { const p = JSON.parse(d); const vault = (p.vaults || []).find((v) => (v.actions || []).some((a) => a.type === "PolicyRecorded") && (v.actions || []).some((a) => a.type === "TreasuryTransferred")); console.log(vault?.vault || ""); });' <<< "$ADMIN_JSON")"
[[ -n "$ADMIN_VAULT" ]] || fail "admin vault proof API did not return a vault with policy and treasury actions"
ADMIN_BUNDLE="$(curl -fsS "$INDEXER_URL/proofs/admin-vaults/$ADMIN_VAULT?bundle=1")"
ADMIN_BUNDLE_FILE="$BUNDLE_DIR/admin-vault.json"
printf '%s' "$ADMIN_BUNDLE" > "$ADMIN_BUNDLE_FILE"
require_contains "admin vault proof bundle" "$ADMIN_BUNDLE" "$CLAIM"
require_contains "admin vault proof bundle" "$ADMIN_BUNDLE" "PolicyRecorded"
require_contains "admin vault proof bundle" "$ADMIN_BUNDLE" "TreasuryTransferred"
require_contains "admin vault proof bundle" "$ADMIN_BUNDLE" "eventTopic"
ADMIN_HTML="$(curl -fsS "$EXPLORER_URL/proofs/admin-vaults")"
require_contains "admin vault proof page" "$ADMIN_HTML" "PQ Admin Vault Proofs"
require_contains "admin vault proof page" "$ADMIN_HTML" "Legacy EOA cannot control this vault"
ADMIN_DETAIL_HTML="$(curl -fsS "$EXPLORER_URL/proofs/admin-vaults/$ADMIN_VAULT")"
require_contains "admin vault detail page" "$ADMIN_DETAIL_HTML" "PQ Admin Vault Proof"
require_contains "admin vault detail page" "$ADMIN_DETAIL_HTML" "Download JSON proof bundle"

pnpm --silent proofs:verify \
  --rpc "$GATEWAY_RPC_URL" \
  --bundle "$PQ_BUNDLE_FILE" \
  --bundle "$FAUCET_BUNDLE_FILE" \
  --bundle "$ADMIN_BUNDLE_FILE"

echo "[qubitor-explorer-smoke] ok"
