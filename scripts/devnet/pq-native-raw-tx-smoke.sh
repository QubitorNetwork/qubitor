#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RPC_URL="${QUBITOR_RPC_URL:-http://127.0.0.1:8545}"
TARGET="${QUBITOR_PQ_NATIVE_RAW_TARGET:-0x000000000000000000000000000000000000dEaD}"
VALUE_WEI="${QUBITOR_PQ_NATIVE_RAW_VALUE_WEI:-12345}"

fail() {
  echo "[qubitor-pq-native-raw] $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

rpc() {
  local method="$1"
  local params="$2"
  curl -fsS "$RPC_URL" \
    -H "content-type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}"
}

json_field() {
  local key="$1"
  node -e 'let input = ""; process.stdin.on("data", (d) => input += d); process.stdin.on("end", () => { const value = JSON.parse(input)[process.argv[1]]; if (value === undefined || value === null) process.exit(1); console.log(value); });' "$key"
}

json_result() {
  node -e 'let input = ""; process.stdin.on("data", (d) => input += d); process.stdin.on("end", () => { const payload = JSON.parse(input); if (payload.error) { console.error(payload.error.message || JSON.stringify(payload.error)); process.exit(2); } if (payload.result === undefined || payload.result === null) process.exit(1); console.log(typeof payload.result === "string" ? payload.result : JSON.stringify(payload.result)); });'
}

hex_to_decimal() {
  node -e 'console.log(BigInt(process.argv[1]).toString())' "$1"
}

decimal_delta_at_least() {
  node -e 'const before = BigInt(process.argv[1]); const after = BigInt(process.argv[2]); const expected = BigInt(process.argv[3]); if (after - before < expected) process.exit(1);' "$1" "$2" "$3"
}

decimal_delta() {
  node -e 'console.log((BigInt(process.argv[2]) - BigInt(process.argv[1])).toString())' "$1" "$2"
}

require_command curl
require_command node
require_command pnpm

CHAIN_ID="$(rpc eth_chainId "[]" | json_result)"
case "$CHAIN_ID" in
  0x164c9|0x164ca) ;;
  *) fail "expected Qubitor devnet/testnet chain ID 0x164c9 or 0x164ca, got $CHAIN_ID" ;;
esac
CHAIN_ID_DEC="$(node -e 'console.log(BigInt(process.argv[1]).toString())' "$CHAIN_ID")"

ACCOUNT="$(
  cd "$ROOT_DIR"
  pnpm --filter @qubitor/pq-native-tx exec tsx -e '
    import { deriveQubitorPQAccountAddress, generateMLDSA65KeyPair, QUBITOR_DEVNET_PQ_SEED, QUBITOR_ZERO_HASH } from "./src/index";

    const seed = process.env.QUBITOR_PQ_NATIVE_RAW_SEED || QUBITOR_DEVNET_PQ_SEED;
    const keypair = generateMLDSA65KeyPair(seed);
    console.log(deriveQubitorPQAccountAddress(keypair.publicKey, QUBITOR_ZERO_HASH));
  '
)"
NONCE="$(hex_to_decimal "$(rpc eth_getTransactionCount "[\"$ACCOUNT\",\"latest\"]" | json_result)")"

TX_JSON="$(
  cd "$ROOT_DIR"
  QUBITOR_PQ_NATIVE_RAW_TARGET="$TARGET" \
  QUBITOR_PQ_NATIVE_RAW_NONCE="$NONCE" \
  QUBITOR_PQ_NATIVE_RAW_VALUE_WEI="$VALUE_WEI" \
  QUBITOR_PQ_NATIVE_RAW_CHAIN_ID="$CHAIN_ID_DEC" \
  pnpm --filter @qubitor/pq-native-tx exec tsx -e '
    import {
      deriveQubitorPQAccountAddress,
      generateMLDSA65KeyPair,
      QUBITOR_DEVNET_PQ_SEED,
      QUBITOR_ZERO_HASH,
      signQubitorPQTxV1,
    } from "./src/index";

    const seed = process.env.QUBITOR_PQ_NATIVE_RAW_SEED || QUBITOR_DEVNET_PQ_SEED;
    const chainId = Number(process.env.QUBITOR_PQ_NATIVE_RAW_CHAIN_ID ?? "91337");
    const keypair = generateMLDSA65KeyPair(seed);
    const account = deriveQubitorPQAccountAddress(keypair.publicKey, QUBITOR_ZERO_HASH);
    const signed = signQubitorPQTxV1({
      chainId,
      nonce: BigInt(process.env.QUBITOR_PQ_NATIVE_RAW_NONCE ?? "0"),
      gasTipCap: 1_000_000_000n,
      gasFeeCap: 2_000_000_000n,
      gas: 30_000n,
      factorySalt: QUBITOR_ZERO_HASH,
      to: process.env.QUBITOR_PQ_NATIVE_RAW_TARGET,
      value: BigInt(process.env.QUBITOR_PQ_NATIVE_RAW_VALUE_WEI ?? "12345"),
      data: "0x",
      pqPublicKey: keypair.publicKey,
      pqPrivateKey: keypair.privateKey,
    });

    console.log(JSON.stringify({
      account,
      publicKey: keypair.publicKey,
      signingHash: signed.signingHash,
      rawTransaction: signed.rawTransaction,
    }));
  '
)"

TX_ACCOUNT="$(printf '%s' "$TX_JSON" | json_field account)"
[[ "$TX_ACCOUNT" == "$ACCOUNT" ]] || fail "signed account $TX_ACCOUNT did not match derived account $ACCOUNT"
SIGNING_HASH="$(printf '%s' "$TX_JSON" | json_field signingHash)"
RAW_TX="$(printf '%s' "$TX_JSON" | json_field rawTransaction)"

ACCOUNT_BALANCE_HEX="$(rpc eth_getBalance "[\"$ACCOUNT\",\"latest\"]" | json_result)"
ACCOUNT_BALANCE="$(hex_to_decimal "$ACCOUNT_BALANCE_HEX")"
if ! node -e 'process.exit(BigInt(process.argv[1]) > 0n ? 0 : 1)' "$ACCOUNT_BALANCE"; then
  fail "Qubitor PQ account $ACCOUNT has no QBT on chain $CHAIN_ID."
fi

TARGET_BEFORE="$(hex_to_decimal "$(rpc eth_getBalance "[\"$TARGET\",\"latest\"]" | json_result)")"
SEND_RESPONSE="$(rpc qubitor_sendRawPQTransaction "[\"$RAW_TX\"]")"
TX_HASH="$(printf '%s' "$SEND_RESPONSE" | json_result)"

RECEIPT=""
for _ in $(seq 1 60); do
  RECEIPT="$(rpc eth_getTransactionReceipt "[\"$TX_HASH\"]")"
  if [[ "$RECEIPT" == *'"error"'* ]]; then
    sleep 1
    continue
  fi
  if [[ "$RECEIPT" != *'"result":null'* ]]; then
    break
  fi
  sleep 1
done

STATUS="$(printf '%s' "$RECEIPT" | node -e 'let input = ""; process.stdin.on("data", (d) => input += d); process.stdin.on("end", () => { const receipt = JSON.parse(input).result; console.log(receipt?.status || ""); });')"
[[ "$STATUS" == "0x1" ]] || fail "expected successful receipt for $TX_HASH, got $RECEIPT"

TARGET_AFTER="$(hex_to_decimal "$(rpc eth_getBalance "[\"$TARGET\",\"latest\"]" | json_result)")"
decimal_delta_at_least "$TARGET_BEFORE" "$TARGET_AFTER" "$VALUE_WEI" || fail "target balance did not increase by $VALUE_WEI wei"

ACCOUNT_NONCE="$(hex_to_decimal "$(rpc eth_getTransactionCount "[\"$ACCOUNT\",\"latest\"]" | json_result)")"
EXPECTED_NONCE="$(node -e 'console.log((BigInt(process.argv[1]) + 1n).toString())' "$NONCE")"
[[ "$ACCOUNT_NONCE" == "$EXPECTED_NONCE" ]] || fail "expected account nonce $EXPECTED_NONCE, got $ACCOUNT_NONCE"

echo "[qubitor-pq-native-raw] account $ACCOUNT"
echo "[qubitor-pq-native-raw] signing hash $SIGNING_HASH"
echo "[qubitor-pq-native-raw] tx $TX_HASH"
echo "[qubitor-pq-native-raw] target $TARGET"
echo "[qubitor-pq-native-raw] target delta $(decimal_delta "$TARGET_BEFORE" "$TARGET_AFTER") wei"
echo "[qubitor-pq-native-raw] ok"
