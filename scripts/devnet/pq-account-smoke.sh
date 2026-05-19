#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NETWORK="${QUBITOR_NETWORK:-${QUBITOR_NETWORK_PROFILE:-devnet}}"
RPC_URL="${QUBITOR_RPC_URL:-http://127.0.0.1:8545}"
DEPLOYMENTS="${QUBITOR_DEPLOYMENTS_FILE:-$ROOT_DIR/contracts/deployments/$NETWORK/deployments.json}"
VALUE_WEI="${QUBITOR_PQ_SMOKE_VALUE_WEI:-12345}"
COUNTERFACTUAL_FUND_WEI="${QUBITOR_PQ_SMOKE_COUNTERFACTUAL_FUND_WEI:-1000000000000000000}"
TARGET="${QUBITOR_PQ_SMOKE_TARGET:-0x000000000000000000000000000000000000dEaD}"

fail() {
  echo "[qubitor-pq-smoke] $*" >&2
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

json_get_file() {
  local key="$1"
  node -e 'const fs = require("fs"); const doc = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(doc[process.argv[2]]);' "$DEPLOYMENTS" "$key"
}

json_get_stdin() {
  local key="$1"
  node -e 'let input = ""; process.stdin.on("data", d => input += d); process.stdin.on("end", () => console.log(JSON.parse(input)[process.argv[1]]));' "$key"
}

json_result() {
  node -e 'let input = ""; process.stdin.on("data", (d) => input += d); process.stdin.on("end", () => { const payload = JSON.parse(input); if (payload.error) { console.error(payload.error.message || JSON.stringify(payload.error)); process.exit(2); } console.log(typeof payload.result === "string" ? payload.result : JSON.stringify(payload.result)); });'
}

hex_to_decimal() {
  node -e 'console.log(BigInt(process.argv[1]).toString())' "$1"
}

decimal_delta_at_least() {
  node -e 'const before = BigInt(process.argv[1]); const after = BigInt(process.argv[2]); const expected = BigInt(process.argv[3]); process.exit(after - before >= expected ? 0 : 1);' "$1" "$2" "$3"
}

require_command cast
require_command curl
require_command node
require_command pnpm

[[ -f "$DEPLOYMENTS" ]] || fail "missing deployments. Run: pnpm contracts:deploy:devnet"

FACTORY="$(json_get_file qubitorAccountFactory)"
READINESS="$(json_get_file accountReadinessRegistry)"
SECURITY="$(json_get_file securityModeRegistry)"
SALT="0x$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"

KEY_JSON="$(
  cd "$ROOT_DIR"
  pnpm --filter @qubitor/pq-native-tx exec tsx -e '
    import { generateMLDSA65KeyPair } from "./src/index";
    console.log(JSON.stringify(generateMLDSA65KeyPair()));
  '
)"
PUBLIC_KEY="$(printf '%s' "$KEY_JSON" | json_get_stdin publicKey)"
MLDSA_PRIVATE_KEY="$(printf '%s' "$KEY_JSON" | json_get_stdin privateKey)"

ACCOUNT="$(
  cd "$ROOT_DIR"
  QUBITOR_PQ_SMOKE_PUBLIC_KEY="$PUBLIC_KEY" \
  QUBITOR_PQ_SMOKE_SALT="$SALT" \
  pnpm --filter @qubitor/pq-native-tx exec tsx -e '
    import { deriveQubitorPQAccountAddress } from "./src/index";
    console.log(deriveQubitorPQAccountAddress(process.env.QUBITOR_PQ_SMOKE_PUBLIC_KEY, process.env.QUBITOR_PQ_SMOKE_SALT));
  '
)"
FACTORY_ACCOUNT="$(cast call "$FACTORY" "getAddress(bytes32,bytes)(address)" "$SALT" "$PUBLIC_KEY" --rpc-url "$RPC_URL")"
[[ "${FACTORY_ACCOUNT,,}" == "${ACCOUNT,,}" ]] || fail "native sender $ACCOUNT does not match factory address $FACTORY_ACCOUNT"

sign_native_tx() {
  local public_key="$1"
  local private_key="$2"
  local salt="$3"
  local nonce="$4"
  local to="$5"
  local value="$6"
  local data="$7"
  local gas="$8"

  cd "$ROOT_DIR"
  QUBITOR_NATIVE_PUBLIC_KEY="$public_key" \
  QUBITOR_NATIVE_PRIVATE_KEY="$private_key" \
  QUBITOR_NATIVE_SALT="$salt" \
  QUBITOR_NATIVE_NONCE="$nonce" \
  QUBITOR_NATIVE_TO="$to" \
  QUBITOR_NATIVE_VALUE="$value" \
  QUBITOR_NATIVE_DATA="$data" \
  QUBITOR_NATIVE_GAS="$gas" \
  pnpm --filter @qubitor/pq-native-tx exec tsx -e '
    import { signQubitorPQTxV1 } from "./src/index";
    const signed = signQubitorPQTxV1({
      chainId: 91337,
      nonce: BigInt(process.env.QUBITOR_NATIVE_NONCE ?? "0"),
      gasTipCap: 1_000_000_000n,
      gasFeeCap: 2_000_000_000n,
      gas: BigInt(process.env.QUBITOR_NATIVE_GAS ?? "1200000"),
      factorySalt: process.env.QUBITOR_NATIVE_SALT,
      to: process.env.QUBITOR_NATIVE_TO,
      value: BigInt(process.env.QUBITOR_NATIVE_VALUE ?? "0"),
      data: process.env.QUBITOR_NATIVE_DATA ?? "0x",
      pqPublicKey: process.env.QUBITOR_NATIVE_PUBLIC_KEY,
      pqPrivateKey: process.env.QUBITOR_NATIVE_PRIVATE_KEY,
    });
    console.log(signed.rawTransaction);
  '
}

send_native_tx() {
  local raw_tx="$1"
  local label="$2"
  local hash receipt status
  hash="$(rpc qubitor_sendRawPQTransaction "[\"$raw_tx\"]" | json_result)"
  echo "[qubitor-pq-smoke] $label tx $hash"

  for _ in $(seq 1 60); do
    receipt="$(rpc eth_getTransactionReceipt "[\"$hash\"]")"
    if [[ "$receipt" != *'"result":null'* ]]; then
      status="$(printf '%s' "$receipt" | node -e 'let input = ""; process.stdin.on("data", d => input += d); process.stdin.on("end", () => console.log(JSON.parse(input).result?.status || ""));')"
      [[ "$status" == "0x1" ]] || fail "$label tx failed: $receipt"
      return 0
    fi
    sleep 1
  done

  fail "$label tx did not produce a receipt"
}

TREASURY_JSON="$(
  cd "$ROOT_DIR"
  pnpm --filter @qubitor/pq-native-tx exec tsx -e '
    import { deriveQubitorPQAccountAddress, generateMLDSA65KeyPair, QUBITOR_DEVNET_PQ_SEED, QUBITOR_ZERO_HASH } from "./src/index";
    const keypair = generateMLDSA65KeyPair(QUBITOR_DEVNET_PQ_SEED);
    console.log(JSON.stringify({
      publicKey: keypair.publicKey,
      privateKey: keypair.privateKey,
      address: deriveQubitorPQAccountAddress(keypair.publicKey, QUBITOR_ZERO_HASH),
      salt: QUBITOR_ZERO_HASH,
    }));
  '
)"
TREASURY_PUBLIC_KEY="$(printf '%s' "$TREASURY_JSON" | json_get_stdin publicKey)"
TREASURY_PRIVATE_KEY="$(printf '%s' "$TREASURY_JSON" | json_get_stdin privateKey)"
TREASURY_ADDRESS="$(printf '%s' "$TREASURY_JSON" | json_get_stdin address)"
TREASURY_SALT="$(printf '%s' "$TREASURY_JSON" | json_get_stdin salt)"

TREASURY_BALANCE="$(hex_to_decimal "$(rpc eth_getBalance "[\"$TREASURY_ADDRESS\",\"latest\"]" | json_result)")"
if ! node -e 'process.exit(BigInt(process.argv[1]) > 0n ? 0 : 1)' "$TREASURY_BALANCE"; then
  fail "treasury PQ wallet $TREASURY_ADDRESS has no genesis QBT. Run pnpm devnet:reset."
fi

echo "[qubitor-pq-smoke] funding counterfactual Qubitor Account $ACCOUNT from PQ treasury $TREASURY_ADDRESS"
TREASURY_NONCE="$(hex_to_decimal "$(rpc eth_getTransactionCount "[\"$TREASURY_ADDRESS\",\"latest\"]" | json_result)")"
FUND_RAW="$(sign_native_tx "$TREASURY_PUBLIC_KEY" "$TREASURY_PRIVATE_KEY" "$TREASURY_SALT" "$TREASURY_NONCE" "$ACCOUNT" "$COUNTERFACTUAL_FUND_WEI" "0x" 30000)"
send_native_tx "$FUND_RAW" "fund"

echo "[qubitor-pq-smoke] deploying account through canonical factory with PQ gas"
TREASURY_NONCE="$(hex_to_decimal "$(rpc eth_getTransactionCount "[\"$TREASURY_ADDRESS\",\"latest\"]" | json_result)")"
CREATE_DATA="$(cast calldata "createAccount(bytes32,bytes)" "$SALT" "$PUBLIC_KEY")"
CREATE_RAW="$(sign_native_tx "$TREASURY_PUBLIC_KEY" "$TREASURY_PRIVATE_KEY" "$TREASURY_SALT" "$TREASURY_NONCE" "$FACTORY" 0 "$CREATE_DATA" 3500000)"
send_native_tx "$CREATE_RAW" "create"

CODE="$(rpc eth_getCode "[\"$ACCOUNT\",\"latest\"]" | json_result)"
[[ "$CODE" != "0x" ]] || fail "account $ACCOUNT was not deployed"

TARGET_BEFORE="$(cast balance "$TARGET" --rpc-url "$RPC_URL")"
ACCOUNT_CONTRACT_NONCE="$(cast call "$ACCOUNT" "nonce()(uint256)" --rpc-url "$RPC_URL")"
MESSAGE="$(cast call "$ACCOUNT" "executeMessage(uint256,address,uint256,bytes)(bytes)" "$ACCOUNT_CONTRACT_NONCE" "$TARGET" "$VALUE_WEI" 0x --rpc-url "$RPC_URL")"
SIGNATURE="$(
  cd "$ROOT_DIR"
  QUBITOR_ACCOUNT_MESSAGE="$MESSAGE" \
  QUBITOR_ACCOUNT_PRIVATE_KEY="$MLDSA_PRIVATE_KEY" \
  pnpm --filter @qubitor/pq-native-tx exec tsx -e '
    import { signMLDSA65 } from "./src/index";
    console.log(signMLDSA65(process.env.QUBITOR_ACCOUNT_MESSAGE, process.env.QUBITOR_ACCOUNT_PRIVATE_KEY, { context: "QUBITOR_ACCOUNT_V1" }));
  '
)"

echo "[qubitor-pq-smoke] executing PQ-authorized transfer from deployed account"
ACCOUNT_CHAIN_NONCE="$(hex_to_decimal "$(rpc eth_getTransactionCount "[\"$ACCOUNT\",\"latest\"]" | json_result)")"
EXECUTE_DATA="$(cast calldata "executePQ(address,uint256,bytes,uint256,bytes)" "$TARGET" "$VALUE_WEI" 0x "$ACCOUNT_CONTRACT_NONCE" "$SIGNATURE")"
EXECUTE_RAW="$(sign_native_tx "$PUBLIC_KEY" "$MLDSA_PRIVATE_KEY" "$SALT" "$ACCOUNT_CHAIN_NONCE" "$ACCOUNT" 0 "$EXECUTE_DATA" 1500000)"
send_native_tx "$EXECUTE_RAW" "execute"

NONCE="$(cast call "$ACCOUNT" "nonce()(uint256)" --rpc-url "$RPC_URL")"
MODE="$(cast call "$SECURITY" "accountMode(address)(uint8)" "$ACCOUNT" --rpc-url "$RPC_URL")"
READINESS_RESULT="$(cast call "$READINESS" "accountReadiness(address)(bool,uint8,bytes32,uint256,uint256)" "$ACCOUNT" --rpc-url "$RPC_URL")"
TARGET_AFTER="$(cast balance "$TARGET" --rpc-url "$RPC_URL")"

echo "[qubitor-pq-smoke] account $ACCOUNT"
echo "[qubitor-pq-smoke] contract nonce $NONCE"
echo "[qubitor-pq-smoke] security mode $MODE"
echo "[qubitor-pq-smoke] readiness $READINESS_RESULT"
echo "[qubitor-pq-smoke] target balance $TARGET_AFTER wei"

EXPECTED_NONCE="$(node -e 'console.log((BigInt(process.argv[1]) + 1n).toString())' "$ACCOUNT_CONTRACT_NONCE")"
[[ "$NONCE" == "$EXPECTED_NONCE" ]] || fail "expected account nonce $EXPECTED_NONCE, got $NONCE"
[[ "$MODE" == "4" ]] || fail "expected PQ Native security mode 4, got $MODE"
decimal_delta_at_least "$TARGET_BEFORE" "$TARGET_AFTER" "$VALUE_WEI" || fail "expected target balance to increase by $VALUE_WEI wei"

echo "[qubitor-pq-smoke] ok"
