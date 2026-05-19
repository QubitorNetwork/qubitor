#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NETWORK="${QUBITOR_NETWORK:-${QUBITOR_NETWORK_PROFILE:-devnet}}"
RPC_URL="${QUBITOR_RPC_URL:-http://127.0.0.1:8545}"
QUBITOR_DEVNET_COMPAT_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
PRIVATE_KEY="${QUBITOR_DEPLOYER_PRIVATE_KEY:-$QUBITOR_DEVNET_COMPAT_PRIVATE_KEY}"
DEPLOYMENTS="${QUBITOR_DEPLOYMENTS_FILE:-$ROOT_DIR/contracts/deployments/$NETWORK/deployments.json}"
TARGET="${QUBITOR_PQ_ADMIN_TARGET:-0x000000000000000000000000000000000000bEEF}"
TREASURY_VALUE_WEI="${QUBITOR_PQ_ADMIN_TREASURY_VALUE_WEI:-24680}"
VAULT_FUND_WEI="${QUBITOR_PQ_ADMIN_VAULT_FUND_WEI:-25000000000000000000}"
POLICY_KEY="${QUBITOR_PQ_ADMIN_POLICY_KEY:-0x69b4390433c7de8b054db6b150a4cc0940d46a296d663b4f386758d3f2dca32e}"
POLICY_VALUE="${QUBITOR_PQ_ADMIN_POLICY_VALUE:-0x0000000000000000000000000000000000000000000000000000000000000064}"
FAUCET_STATUS_URL="${QUBITOR_FAUCET_STATUS_URL:-http://127.0.0.1:18546/faucet/status}"
FAUCET_REQUEST_URL="${QUBITOR_FAUCET_REQUEST_URL:-http://127.0.0.1:18546/faucet/request}"

if [[ ! -f "$DEPLOYMENTS" ]]; then
  echo "[qubitor-pq-admin] missing deployments. Run: pnpm contracts:deploy:devnet" >&2
  exit 1
fi

if ! command -v cast >/dev/null 2>&1; then
  echo "[qubitor-pq-admin] cast is required" >&2
  exit 1
fi

if ! command -v forge >/dev/null 2>&1; then
  echo "[qubitor-pq-admin] forge is required" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[qubitor-pq-admin] node is required" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "[qubitor-pq-admin] curl is required" >&2
  exit 1
fi

if [[ -n "${GO_BIN:-}" ]]; then
  GO_CMD="$GO_BIN"
elif command -v go1.22.12 >/dev/null 2>&1; then
  GO_CMD="go1.22.12"
elif [[ -x "$HOME/go/bin/go1.22.12" ]]; then
  GO_CMD="$HOME/go/bin/go1.22.12"
else
  GO_CMD="go"
fi

is_local_rpc() {
  case "$RPC_URL" in
    http://127.0.0.1:*|http://localhost:*|http://0.0.0.0:*|http://[::1]:*) return 0 ;;
    *) return 1 ;;
  esac
}

is_known_devnet_key() {
  local key="${PRIVATE_KEY,,}"
  [[ "$key" == "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" ]] ||
    [[ "$key" == "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" ]] ||
    [[ "$key" == "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" ]]
}

if is_known_devnet_key && ! is_local_rpc; then
  echo "[qubitor-pq-admin] refusing bundled devnet key against non-local RPC $RPC_URL" >&2
  exit 1
fi

json_get_file() {
  local key="$1"
  node -e 'const fs = require("fs"); const doc = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(doc[process.argv[2]]);' "$DEPLOYMENTS" "$key"
}

json_get_stdin() {
  local key="$1"
  node -e 'let input = ""; process.stdin.on("data", d => input += d); process.stdin.on("end", () => console.log(JSON.parse(input)[process.argv[1]]));' "$key"
}

json_stringify() {
  local key="$1"
  local value="$2"
  node -e 'console.log(JSON.stringify({ [process.argv[1]]: process.argv[2] }))' "$key" "$value"
}

assert_delta_at_least() {
  node -e 'const before = BigInt(process.argv[1]); const after = BigInt(process.argv[2]); const expected = BigInt(process.argv[3]); if (after - before < expected) process.exit(1);' "$1" "$2" "$3"
}

decimal_delta() {
  node -e 'console.log((BigInt(process.argv[2]) - BigInt(process.argv[1])).toString())' "$1" "$2"
}

wait_for_delta_at_least() {
  local address="$1"
  local before="$2"
  local expected_delta="$3"

  for _ in $(seq 1 60); do
    local after
    after="$(cast balance "$address" --rpc-url "$RPC_URL")"
    if assert_delta_at_least "$before" "$after" "$expected_delta"; then
      printf '%s' "$after"
      return 0
    fi
    sleep 1
  done

  cast balance "$address" --rpc-url "$RPC_URL"
  return 1
}

FACTORY="$(json_get_file qubitorAccountFactory)"
SALT="0x$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
FAUCET_STATUS="$(curl -fsS "$FAUCET_STATUS_URL" 2>/dev/null || true)"
FAUCET_AVAILABLE=0
FAUCET_ADDRESS=""
FAUCET_AMOUNT_WEI=""
if [[ -n "$FAUCET_STATUS" ]]; then
  FAUCET_ADDRESS="$(printf '%s' "$FAUCET_STATUS" | json_get_stdin faucetAddress)"
  FAUCET_AMOUNT_WEI="$(printf '%s' "$FAUCET_STATUS" | json_get_stdin amountWei)"
  if [[ "$FAUCET_ADDRESS" == 0x* && "$FAUCET_AMOUNT_WEI" != "undefined" ]]; then
    FAUCET_AVAILABLE=1
  fi
fi

KEY_JSON="$(cd "$ROOT_DIR/clients/qubitor-node" && "$GO_CMD" run ./cmd/mldsa65-tool keygen)"
PUBLIC_KEY="$(printf '%s' "$KEY_JSON" | json_get_stdin publicKey)"
MLDSA_PRIVATE_KEY="$(printf '%s' "$KEY_JSON" | json_get_stdin privateKey)"

ADMIN_ACCOUNT="$(cast call "$FACTORY" "getAddress(bytes32,bytes)(address)" "$SALT" "$PUBLIC_KEY" --rpc-url "$RPC_URL")"

echo "[qubitor-pq-admin] creating PQ admin account $ADMIN_ACCOUNT"
CREATE_OUTPUT="$(cast send "$FACTORY" "createAccount(bytes32,bytes)" "$SALT" "$PUBLIC_KEY" --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --gas-limit 3000000)"
echo "$CREATE_OUTPUT" | awk '$1 == "transactionHash" { print "[qubitor-pq-admin] create tx " $2 }'

echo "[qubitor-pq-admin] deploying admin vault controlled by $ADMIN_ACCOUNT"
VAULT_OUTPUT="$(forge create --root "$ROOT_DIR/contracts" --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --broadcast src/QubitorAdminVault.sol:QubitorAdminVault --constructor-args "$ADMIN_ACCOUNT")"
echo "$VAULT_OUTPUT"
VAULT="$(echo "$VAULT_OUTPUT" | awk '/Deployed to:/ { print $3 }')"

echo "[qubitor-pq-admin] funding admin vault"
FUND_OUTPUT="$(cast send "$VAULT" --value "$VAULT_FUND_WEI" --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY")"
echo "$FUND_OUTPUT" | awk '$1 == "transactionHash" { print "[qubitor-pq-admin] fund tx " $2 }'

echo "[qubitor-pq-admin] asserting Legacy EOA cannot record admin policy"
LEGACY_POLICY_OUTPUT="$(cast send "$VAULT" "recordPolicy(bytes32,bytes32)" "$POLICY_KEY" "$POLICY_VALUE" --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --gas-limit 300000 2>&1 || true)"
if printf '%s' "$LEGACY_POLICY_OUTPUT" | grep -Fq "status               1 (success)"; then
  printf '%s\n' "$LEGACY_POLICY_OUTPUT" >&2
  echo "[qubitor-pq-admin] expected Legacy EOA policy call to revert" >&2
  exit 1
fi
if ! printf '%s' "$LEGACY_POLICY_OUTPUT" | grep -Eq "status[[:space:]]+0 \\(failed\\)|revert|UnauthorizedPQController"; then
  printf '%s\n' "$LEGACY_POLICY_OUTPUT" >&2
  echo "[qubitor-pq-admin] expected Legacy EOA policy call to report a failed receipt or revert" >&2
  exit 1
fi

POLICY_DATA="$(cast calldata "recordPolicy(bytes32,bytes32)" "$POLICY_KEY" "$POLICY_VALUE")"
POLICY_MESSAGE="$(cast call "$ADMIN_ACCOUNT" "executeMessage(uint256,address,uint256,bytes)(bytes)" 0 "$VAULT" 0 "$POLICY_DATA" --rpc-url "$RPC_URL")"
POLICY_SIGNATURE="$(cd "$ROOT_DIR/clients/qubitor-node" && "$GO_CMD" run ./cmd/mldsa65-tool sign --private-key "$MLDSA_PRIVATE_KEY" --message "$POLICY_MESSAGE")"

echo "[qubitor-pq-admin] recording policy through PQ admin account"
POLICY_OUTPUT="$(cast send "$ADMIN_ACCOUNT" "executePQ(address,uint256,bytes,uint256,bytes)" "$VAULT" 0 "$POLICY_DATA" 0 "$POLICY_SIGNATURE" --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --gas-limit 1200000)"
echo "$POLICY_OUTPUT" | awk '$1 == "transactionHash" { print "[qubitor-pq-admin] policy tx " $2 }'

STORED_POLICY="$(cast call "$VAULT" "policyValue(bytes32)(bytes32)" "$POLICY_KEY" --rpc-url "$RPC_URL")"
POLICY_NONCE="$(cast call "$VAULT" "policyNonce()(uint256)" --rpc-url "$RPC_URL")"
if [[ "${STORED_POLICY,,}" != "${POLICY_VALUE,,}" ]]; then
  echo "[qubitor-pq-admin] expected policy value $POLICY_VALUE, got $STORED_POLICY" >&2
  exit 1
fi

TREASURY_TARGET="$TARGET"
TREASURY_TRANSFER_WEI="$TREASURY_VALUE_WEI"
if [[ "$FAUCET_AVAILABLE" == "1" ]]; then
  TREASURY_TARGET="$FAUCET_ADDRESS"
  TREASURY_TRANSFER_WEI="${QUBITOR_PQ_ADMIN_FAUCET_TOP_UP_WEI:-$FAUCET_AMOUNT_WEI}"
  echo "[qubitor-pq-admin] using PQ treasury transfer to top up faucet hot wallet $TREASURY_TARGET"
else
  echo "[qubitor-pq-admin] faucet status unavailable; using generic treasury target $TREASURY_TARGET"
fi

TRANSFER_DATA="$(cast calldata "transferTreasury(address,uint256)" "$TREASURY_TARGET" "$TREASURY_TRANSFER_WEI")"
TRANSFER_MESSAGE="$(cast call "$ADMIN_ACCOUNT" "executeMessage(uint256,address,uint256,bytes)(bytes)" 1 "$VAULT" 0 "$TRANSFER_DATA" --rpc-url "$RPC_URL")"
TRANSFER_SIGNATURE="$(cd "$ROOT_DIR/clients/qubitor-node" && "$GO_CMD" run ./cmd/mldsa65-tool sign --private-key "$MLDSA_PRIVATE_KEY" --message "$TRANSFER_MESSAGE")"
TARGET_BEFORE="$(cast balance "$TREASURY_TARGET" --rpc-url "$RPC_URL")"

echo "[qubitor-pq-admin] transferring treasury through PQ admin account"
TRANSFER_OUTPUT="$(cast send "$ADMIN_ACCOUNT" "executePQ(address,uint256,bytes,uint256,bytes)" "$VAULT" 0 "$TRANSFER_DATA" 1 "$TRANSFER_SIGNATURE" --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --gas-limit 1200000)"
echo "$TRANSFER_OUTPUT" | awk '$1 == "transactionHash" { print "[qubitor-pq-admin] treasury tx " $2 }'

ACCOUNT_NONCE="$(cast call "$ADMIN_ACCOUNT" "nonce()(uint256)" --rpc-url "$RPC_URL")"
TARGET_AFTER="$(cast balance "$TREASURY_TARGET" --rpc-url "$RPC_URL")"
VAULT_BALANCE="$(cast balance "$VAULT" --rpc-url "$RPC_URL")"

if [[ "$POLICY_NONCE" != "1" ]]; then
  echo "[qubitor-pq-admin] expected policy nonce 1, got $POLICY_NONCE" >&2
  exit 1
fi

if [[ "$ACCOUNT_NONCE" != "2" ]]; then
  echo "[qubitor-pq-admin] expected PQ admin account nonce 2, got $ACCOUNT_NONCE" >&2
  exit 1
fi

if ! assert_delta_at_least "$TARGET_BEFORE" "$TARGET_AFTER" "$TREASURY_TRANSFER_WEI"; then
  echo "[qubitor-pq-admin] expected treasury target balance delta of at least $TREASURY_TRANSFER_WEI wei" >&2
  exit 1
fi

if [[ "$FAUCET_AVAILABLE" == "1" ]]; then
  FAUCET_RECIPIENT="0x$(od -An -N20 -tx1 /dev/urandom | tr -d ' \n')"
  FAUCET_RECIPIENT_BEFORE="$(cast balance "$FAUCET_RECIPIENT" --rpc-url "$RPC_URL")"

  echo "[qubitor-pq-admin] requesting faucet QBT after PQ treasury top-up"
  FAUCET_RESPONSE="$(curl -fsS "$FAUCET_REQUEST_URL" -H "content-type: application/json" -d "$(json_stringify address "$FAUCET_RECIPIENT")")"
  if [[ "$(printf '%s' "$FAUCET_RESPONSE" | json_get_stdin ok)" != "true" ]]; then
    echo "[qubitor-pq-admin] expected faucet request success, got: $FAUCET_RESPONSE" >&2
    exit 1
  fi
  FAUCET_TX="$(printf '%s' "$FAUCET_RESPONSE" | json_get_stdin hash)"

  if ! FAUCET_RECIPIENT_AFTER="$(wait_for_delta_at_least "$FAUCET_RECIPIENT" "$FAUCET_RECIPIENT_BEFORE" "$FAUCET_AMOUNT_WEI")"; then
    echo "[qubitor-pq-admin] expected faucet recipient delta of at least $FAUCET_AMOUNT_WEI wei" >&2
    exit 1
  fi

  echo "[qubitor-pq-admin] faucet tx $FAUCET_TX"
  echo "[qubitor-pq-admin] faucet recipient $FAUCET_RECIPIENT"
  echo "[qubitor-pq-admin] faucet recipient delta $(decimal_delta "$FAUCET_RECIPIENT_BEFORE" "$FAUCET_RECIPIENT_AFTER") wei"
fi

echo "[qubitor-pq-admin] admin account $ADMIN_ACCOUNT"
echo "[qubitor-pq-admin] admin vault $VAULT"
echo "[qubitor-pq-admin] policy nonce $POLICY_NONCE"
echo "[qubitor-pq-admin] account nonce $ACCOUNT_NONCE"
echo "[qubitor-pq-admin] vault balance $VAULT_BALANCE wei"
echo "[qubitor-pq-admin] treasury target $TREASURY_TARGET"
echo "[qubitor-pq-admin] treasury target delta $(decimal_delta "$TARGET_BEFORE" "$TARGET_AFTER") wei"
echo "[qubitor-pq-admin] ok"
