#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NETWORK="${QUBITOR_NETWORK:-${QUBITOR_NETWORK_PROFILE:-devnet}}"
WALLET_DIR="${QUBITOR_WALLET_DIR:-$ROOT_DIR/../Qubitor}"
RPC_URL="${QUBITOR_RPC_URL:-http://127.0.0.1:8545}"
FAUCET_URL="${QUBITOR_FAUCET_URL:-http://127.0.0.1:18546}"
PQ_RELAYER_URL="${QUBITOR_PQ_RELAYER_URL:-http://127.0.0.1:18548}"
CHAIN_ID="${EXPO_PUBLIC_QUBITOR_CHAIN_ID:-91337}"
DEPLOYMENTS="${QUBITOR_DEPLOYMENTS_FILE:-$ROOT_DIR/contracts/deployments/$NETWORK/deployments.json}"
VALUE_WEI="${QUBITOR_WALLET_PQ_BACKUP_SMOKE_VALUE_WEI:-67890}"
TARGET="${QUBITOR_WALLET_PQ_BACKUP_SMOKE_TARGET:-0x000000000000000000000000000000000000dEaD}"
BACKUP_PASSCODE="${QUBITOR_WALLET_PQ_BACKUP_SMOKE_PASSCODE:-correct horse battery staple}"
WRONG_BACKUP_PASSCODE="${QUBITOR_WALLET_PQ_BACKUP_SMOKE_WRONG_PASSCODE:-wrong horse battery staple}"

if [[ ! -f "$DEPLOYMENTS" ]]; then
  echo "[qubitor-wallet-pq-backup] missing deployments. Run: pnpm contracts:deploy:devnet" >&2
  exit 1
fi

if [[ ! -d "$WALLET_DIR" ]]; then
  echo "[qubitor-wallet-pq-backup] missing wallet repo: $WALLET_DIR" >&2
  exit 1
fi

if ! command -v cast >/dev/null 2>&1; then
  echo "[qubitor-wallet-pq-backup] cast is required" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "[qubitor-wallet-pq-backup] curl is required" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[qubitor-wallet-pq-backup] node is required" >&2
  exit 1
fi

json_get_file() {
  local file="$1"
  local key="$2"
  node -e 'const fs = require("fs"); const doc = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(doc[process.argv[2]]);' "$file" "$key"
}

json_get_path_stdin() {
  local path="$1"
  node -e '
    let input = "";
    process.stdin.on("data", d => input += d);
    process.stdin.on("end", () => {
      const value = process.argv[1].split(".").reduce((node, key) => node?.[key], JSON.parse(input));
      console.log(typeof value === "object" ? JSON.stringify(value) : value);
    });
  ' "$path"
}

json_stringify() {
  node -e 'const out = {}; for (let i = 1; i < process.argv.length; i += 2) out[process.argv[i]] = process.argv[i + 1]; console.log(JSON.stringify(out));' "$@"
}

profile_json() {
  node -e '
    console.log(JSON.stringify({
      version: 2,
      currentKey: { publicKey: process.argv[1], privateKey: process.argv[2] },
      deploymentKey: { publicKey: process.argv[3], privateKey: process.argv[2] },
      deploymentPublicKey: process.argv[3],
      deploymentSalt: process.argv[4],
      accountAddress: process.argv[5],
      currentPublicKeyCommitment: process.argv[6],
      keyVersion: 1
    }));
  ' "$1" "$2" "$3" "$4" "$5" "$6"
}

bigint_gte() {
  node -e 'process.exit(BigInt(process.argv[1]) >= BigInt(process.argv[2]) ? 0 : 1)' "$1" "$2"
}

bigint_sub() {
  node -e 'console.log((BigInt(process.argv[1]) - BigInt(process.argv[2])).toString())' "$1" "$2"
}

hex_lower() {
  node -e 'console.log(process.argv[1].toLowerCase())' "$1"
}

wallet_pq() {
  (cd "$WALLET_DIR" && pnpm --filter @qubitor/pq-crypto exec tsx src/cli.ts "$@")
}

post_json() {
  local url="$1"
  local body="$2"
  curl -sS -X POST "$url" -H "content-type: application/json" -d "$body"
}

poll_account() {
  local body="$1"
  local account_json=""
  for _ in $(seq 1 30); do
    account_json="$(post_json "$PQ_RELAYER_URL/pq-dev/account" "$body")"
    local balance
    balance="$(printf '%s' "$account_json" | json_get_path_stdin balanceWei)"
    local deployed
    deployed="$(printf '%s' "$account_json" | json_get_path_stdin deployed)"
    if [[ "$deployed" == "true" && "$balance" =~ ^[0-9]+$ ]] && bigint_gte "$balance" "$VALUE_WEI"; then
      printf '%s' "$account_json"
      return 0
    fi
    sleep 1
  done

  printf '%s' "$account_json"
  return 1
}

SECURITY="$(json_get_file "$DEPLOYMENTS" securityModeRegistry)"
SALT="0x$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"

echo "[qubitor-wallet-pq-backup] generating wallet-owned ML-DSA-65 key"
KEY_JSON="$(wallet_pq keygen)"
PUBLIC_KEY="$(printf '%s' "$KEY_JSON" | json_get_path_stdin publicKey)"
PRIVATE_KEY="$(printf '%s' "$KEY_JSON" | json_get_path_stdin privateKey)"

ACCOUNT_BODY="$(json_stringify publicKey "$PUBLIC_KEY" salt "$SALT")"
ACCOUNT_JSON="$(post_json "$PQ_RELAYER_URL/pq-dev/account" "$ACCOUNT_BODY")"
ACCOUNT="$(printf '%s' "$ACCOUNT_JSON" | json_get_path_stdin accountAddress)"

echo "[qubitor-wallet-pq-backup] requesting faucet QBT and PQ account deployment"
FAUCET_JSON="$(post_json "$FAUCET_URL/faucet/request" "$(json_stringify address "$ACCOUNT" publicKey "$PUBLIC_KEY" salt "$SALT" deployAccount true)")"
FAUCET_OK="$(printf '%s' "$FAUCET_JSON" | json_get_path_stdin ok)"
if [[ "$FAUCET_OK" != "true" ]]; then
  echo "[qubitor-wallet-pq-backup] expected faucet deployment success, got: $FAUCET_JSON" >&2
  exit 1
fi
FUNDED_JSON="$(poll_account "$ACCOUNT_BODY")" || {
  BALANCE="$(printf '%s' "$FUNDED_JSON" | json_get_path_stdin balanceWei)"
  echo "[qubitor-wallet-pq-backup] expected faucet balance >= $VALUE_WEI, got $BALANCE" >&2
  exit 1
}

COMMITMENT="$(cast call "$ACCOUNT" "pqPublicKeyCommitment()(bytes32)" --rpc-url "$RPC_URL")"
PROFILE_JSON="$(profile_json "$PUBLIC_KEY" "$PRIVATE_KEY" "$PUBLIC_KEY" "$SALT" "$ACCOUNT" "$COMMITMENT")"

echo "[qubitor-wallet-pq-backup] exporting encrypted backup"
BACKUP_JSON="$(printf '%s' "$PROFILE_JSON" | wallet_pq backup-encrypt --passcode "$BACKUP_PASSCODE")"
BACKUP_FORMAT="$(printf '%s' "$BACKUP_JSON" | json_get_path_stdin format)"
BACKUP_PREVIEW_ACCOUNT="$(printf '%s' "$BACKUP_JSON" | json_get_path_stdin preview.accountAddress)"
BACKUP_CIPHERTEXT="$(printf '%s' "$BACKUP_JSON" | json_get_path_stdin encryption.ciphertext)"

if [[ "$BACKUP_FORMAT" != "qubitor.devnet.pq-wallet-backup.encrypted.v1" ]]; then
  echo "[qubitor-wallet-pq-backup] expected encrypted backup format, got $BACKUP_FORMAT" >&2
  exit 1
fi

if [[ "$(hex_lower "$BACKUP_PREVIEW_ACCOUNT")" != "$(hex_lower "$ACCOUNT")" ]]; then
  echo "[qubitor-wallet-pq-backup] backup preview account mismatch" >&2
  exit 1
fi

if [[ ! "$BACKUP_CIPHERTEXT" =~ ^0x[0-9a-fA-F]+$ ]]; then
  echo "[qubitor-wallet-pq-backup] encrypted backup missing ciphertext" >&2
  exit 1
fi

if printf '%s' "$BACKUP_JSON" | grep -F "$PRIVATE_KEY" >/dev/null; then
  echo "[qubitor-wallet-pq-backup] encrypted backup leaked private key" >&2
  exit 1
fi

echo "[qubitor-wallet-pq-backup] asserting wrong passcode cannot restore"
if printf '%s' "$BACKUP_JSON" | wallet_pq backup-decrypt --passcode "$WRONG_BACKUP_PASSCODE" >/dev/null 2>&1; then
  echo "[qubitor-wallet-pq-backup] wrong passcode unexpectedly decrypted backup" >&2
  exit 1
fi

echo "[qubitor-wallet-pq-backup] restoring encrypted backup"
RESTORED_PROFILE="$(printf '%s' "$BACKUP_JSON" | wallet_pq backup-decrypt --passcode "$BACKUP_PASSCODE")"
RESTORED_ACCOUNT="$(printf '%s' "$RESTORED_PROFILE" | json_get_path_stdin accountAddress)"
RESTORED_PUBLIC_KEY="$(printf '%s' "$RESTORED_PROFILE" | json_get_path_stdin currentKey.publicKey)"
RESTORED_PRIVATE_KEY="$(printf '%s' "$RESTORED_PROFILE" | json_get_path_stdin currentKey.privateKey)"
RESTORED_DEPLOYMENT_PUBLIC_KEY="$(printf '%s' "$RESTORED_PROFILE" | json_get_path_stdin deploymentPublicKey)"
RESTORED_SALT="$(printf '%s' "$RESTORED_PROFILE" | json_get_path_stdin deploymentSalt)"

if [[ "$(hex_lower "$RESTORED_ACCOUNT")" != "$(hex_lower "$ACCOUNT")" ]]; then
  echo "[qubitor-wallet-pq-backup] restored account mismatch" >&2
  exit 1
fi

if [[ "$(hex_lower "$RESTORED_PUBLIC_KEY")" != "$(hex_lower "$PUBLIC_KEY")" ]]; then
  echo "[qubitor-wallet-pq-backup] restored current public key mismatch" >&2
  exit 1
fi

if [[ "$(hex_lower "$RESTORED_DEPLOYMENT_PUBLIC_KEY")" != "$(hex_lower "$PUBLIC_KEY")" ]]; then
  echo "[qubitor-wallet-pq-backup] restored deployment public key mismatch" >&2
  exit 1
fi

if [[ "$(hex_lower "$RESTORED_SALT")" != "$(hex_lower "$SALT")" ]]; then
  echo "[qubitor-wallet-pq-backup] restored salt mismatch" >&2
  exit 1
fi

START_TARGET_BALANCE="$(cast balance "$TARGET" --rpc-url "$RPC_URL")"
TRANSFER_MESSAGE="$(cast call "$ACCOUNT" "executeMessage(uint256,address,uint256,bytes)(bytes)" 0 "$TARGET" "$VALUE_WEI" 0x --rpc-url "$RPC_URL")"
RESTORED_SIGNATURE="$(wallet_pq sign --private-key "$RESTORED_PRIVATE_KEY" --message "$TRANSFER_MESSAGE")"
RESTORED_VERIFY="$(wallet_pq verify --public-key "$RESTORED_PUBLIC_KEY" --message "$TRANSFER_MESSAGE" --signature "$RESTORED_SIGNATURE")"
if [[ "$RESTORED_VERIFY" != "true" ]]; then
  echo "[qubitor-wallet-pq-backup] restored key failed local signature verification" >&2
  exit 1
fi

echo "[qubitor-wallet-pq-backup] submitting raw PQ transfer signed by restored key"
TRANSFER_JSON="$(
  cd "$WALLET_DIR"
  pnpm --filter @qubitor/mobile exec tsx scripts/devnet-submit-pq-transfer.ts \
    --account "$ACCOUNT" \
    --public-key "$RESTORED_DEPLOYMENT_PUBLIC_KEY" \
    --private-key "$RESTORED_PRIVATE_KEY" \
    --salt "$RESTORED_SALT" \
    --target "$TARGET" \
    --value-wei "$VALUE_WEI" \
    --data 0x \
    --nonce 0 \
    --signature "$RESTORED_SIGNATURE" \
    --chain-id "$CHAIN_ID" \
    --rpc-url "$RPC_URL" \
    --pq-relayer-url "$PQ_RELAYER_URL"
)"
TRANSFER_OK="$(printf '%s' "$TRANSFER_JSON" | json_get_path_stdin ok)"
if [[ "$TRANSFER_OK" != "true" ]]; then
  echo "[qubitor-wallet-pq-backup] expected restored-key transfer success, got: $TRANSFER_JSON" >&2
  exit 1
fi

TRANSFER_TX="$(printf '%s' "$TRANSFER_JSON" | json_get_path_stdin transactionHash)"
TRANSFER_STATUS="$(printf '%s' "$TRANSFER_JSON" | json_get_path_stdin status)"
TRANSFER_BLOCK="$(printf '%s' "$TRANSFER_JSON" | json_get_path_stdin blockNumber)"
NONCE_FINAL="$(cast call "$ACCOUNT" "nonce()(uint256)" --rpc-url "$RPC_URL")"
MODE="$(cast call "$SECURITY" "accountMode(address)(uint8)" "$ACCOUNT" --rpc-url "$RPC_URL")"
END_TARGET_BALANCE="$(cast balance "$TARGET" --rpc-url "$RPC_URL")"
DELTA="$(bigint_sub "$END_TARGET_BALANCE" "$START_TARGET_BALANCE")"

echo "[qubitor-wallet-pq-backup] account $ACCOUNT"
echo "[qubitor-wallet-pq-backup] restored-key transfer tx $TRANSFER_TX"
echo "[qubitor-wallet-pq-backup] transfer block $TRANSFER_BLOCK status $TRANSFER_STATUS"
echo "[qubitor-wallet-pq-backup] nonce $NONCE_FINAL"
echo "[qubitor-wallet-pq-backup] security mode $MODE"
echo "[qubitor-wallet-pq-backup] target delta $DELTA wei"

if [[ "$TRANSFER_STATUS" != "success" ]]; then
  echo "[qubitor-wallet-pq-backup] expected successful restored-key transfer" >&2
  exit 1
fi

if [[ "$NONCE_FINAL" != "1" ]]; then
  echo "[qubitor-wallet-pq-backup] expected final nonce 1" >&2
  exit 1
fi

if [[ "$MODE" != "4" ]]; then
  echo "[qubitor-wallet-pq-backup] expected PQ Native security mode 4" >&2
  exit 1
fi

if ! bigint_gte "$DELTA" "$VALUE_WEI"; then
  echo "[qubitor-wallet-pq-backup] expected target balance delta >= $VALUE_WEI" >&2
  exit 1
fi

echo "[qubitor-wallet-pq-backup] ok"
