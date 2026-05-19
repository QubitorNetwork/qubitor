# PQ-Native Transaction Layer

## Non-Negotiable Outcome

Qubitor-native means **No EOA anywhere**.

Every externally visible account used by the wallet, miner reward recipient, faucet treasury, relayer/submitter, deployer, protocol/admin control, and public launch material must be a Qubitor wallet address backed by a Qubitor Account or a stricter PQ policy. ECDSA/secp256k1 addresses and private keys are not part of the Qubitor-native launch path.

A Qubitor-native testnet or mainnet must not require:

- `QUBITOR_DEPLOYER_PRIVATE_KEY`
- `QUBITOR_FAUCET_PRIVATE_KEY`
- `QUBITOR_PQ_RELAYER_PRIVATE_KEY`
- `QUBITOR_MINER_PRIVATE_KEY`
- legacy Ethereum transaction types `0x00`, `0x01`, or `0x02`

Those names remain documented only so existing scaffold code cannot be mistaken for the final architecture.

## Required Protocol Change

Smart accounts alone are not enough. If the chain accepts only Ethereum raw transactions, some EOA still has to sign deployment, gas payment, relaying, faucet, or bootstrap transactions. Removing EOAs requires a native transaction path in the node.

Qubitor will add a PQ-native transaction type, `QubitorPQTxV1`, accepted through `eth_sendRawTransaction` as a custom typed transaction or through `qubitor_sendRawPQTransaction`.

Implementation status:

- CoreGeth now reserves typed transaction `0x04` as `QubitorPQTxType`.
- `QubitorPQTxV1` carries a Qubitor wallet address in `Account` and ML-DSA-65 authorization fields.
- CoreGeth sender derivation verifies the ML-DSA signature and returns the Qubitor wallet address, not an EOA.
- CoreGeth binds the Qubitor wallet address to the canonical QubitorAccountFactory CREATE2 address for `(pqPublicKey, factorySalt)`, so the native transaction sender and deployed smart-account address are the same `0x` account.
- The legacy txpool accepts the typed PQ transaction for devnet testing.
- State precheck can allow a contract-backed Qubitor Account sender only for PQ-native messages.
- The wallet now produces raw `QubitorPQTxV1` bytes with the same signing hash and typed transaction encoding that CoreGeth validates.
- A cross-repo fixture test checks the wallet signing hash and raw transaction hash against CoreGeth decoding.
- CoreGeth exposes `qubitor_sendRawPQTransaction` for PQ-only raw transaction submission and keeps `eth_sendRawTransaction` for standard typed transaction compatibility.
- Devnet genesis prefunds a deterministic Qubitor wallet address and installs the canonical account factory/registries at system addresses, and `pnpm devnet:pq-native-raw-smoke` submits a live raw `QubitorPQTxV1` without a relayer or EOA sender.
- `QUBITOR_EOA_TXS=0` disables legacy Ethereum transaction submissions at JSON-RPC and txpool validation; devnet live checks reject an EIP-1559 raw transaction under that flag.
- The faucet now signs bounded devnet grants as native `QubitorPQTxV1` transactions from the genesis-funded ML-DSA account.
- The PQ relayer service is a raw transaction gateway; it submits wallet-signed `0x04` bytes and no longer owns an EOA gas-payer key.
- `pnpm devnet:soak` repeatedly submits native PQ transactions and `pnpm devnet:multinode-smoke` verifies two local CoreGeth nodes peer, sync, and mine a PQ transaction submitted through the non-mining peer.
- `pnpm devnet:pq-smoke` funds a counterfactual Qubitor Account, deploys it through the canonical factory using PQ-native gas, and executes `executePQ` from the deployed account without an EOA.
- Remaining implementation slice: production PQ vault/policy integration for public testnet/mainnet operations.

The transaction must carry enough data for CoreGeth to validate account control before execution:

- `chainId`
- `nonce`
- `maxFeePerGas`
- `maxPriorityFeePerGas`
- `gasLimit`
- `accountAddress`
- `factorySalt`
- `pqPublicKey`
- `target`
- `value`
- `data`
- `context`
- `signature`

The signature domain must bind the Qubitor network, transaction version, chain ID, account address, nonce, gas fields, target, value, calldata hash, and context. Breaking ECDSA/secp256k1 must not help an attacker create or submit a valid Qubitor-native transaction.

## Sender And Address Rule

The sender is the Qubitor wallet address, not an EOA.

For v1, the canonical sender is the deterministic `QubitorAccount` address derived from:

- the canonical account factory address
- the wallet's ML-DSA-65 public key commitment
- the wallet salt
- the account bytecode hash

If the account is not deployed yet, the node may allow first-use deployment through the canonical factory path, but the sender remains the counterfactual Qubitor Account address. Gas is charged to the Qubitor Account balance.

## Node Responsibilities

CoreGeth must be changed so Qubitor-native networks can:

- decode `QubitorPQTxV1`
- reject malformed PQ transactions in the transaction pool
- verify ML-DSA-65 signatures before state transition
- derive the sender as the Qubitor Account address
- charge gas to the Qubitor Account balance
- execute the account call path without an EOA gas payer
- reject replay by enforcing the account nonce
- expose mining status, receipts, logs, and balances through standard Ethereum read RPC
- reject legacy Ethereum transaction types once `QUBITOR_EOA_TXS=0`

The ML-DSA verifier precompile at `0x0000000000000000000000000000000000000100` remains the shared verification primitive. The transaction layer may call the same Go verifier directly during transaction validation.

## Genesis And Deployment

Qubitor-native launch material must not deploy contracts with an EOA.

The devnet genesis file installs:

- ML-DSA-65 precompile activation
- canonical `QubitorAccountFactory` at `0x0000000000000000000000000000000000000203`
- `SecurityModeRegistry` at `0x0000000000000000000000000000000000000201`
- `AccountReadinessRegistry` at `0x0000000000000000000000000000000000000202`
- initial PQ treasury wallet address
- initial faucet policy account, if used
- miner reward recipient as a Qubitor wallet address

The miner `etherbase` is only a reward recipient. It must be a Qubitor wallet address; it does not need an EOA private key because consensus credits block rewards directly to the configured coinbase address.

## Service Model

The faucet and relayer become PQ submitters, not EOA signers.

- The wallet signs a `QubitorPQTxV1` with ML-DSA.
- The gateway or submitter forwards the raw PQ transaction.
- A faucet policy can authorize bounded QBT grants from a Qubitor Account.
- No service owns a gas-payer EOA.
- No service can move funds by producing an ECDSA signature.

Service env should eventually point to Qubitor wallet vaults, policy files, and public endpoints, not Ethereum private keys.

## Network Policy

Temporary non-native experiments may still run old Ethereum tooling, but Qubitor-native devnet/testnet/mainnet runs must set `QUBITOR_EOA_TXS=0` and use genesis/system contract installation instead of EOA deployment.

Qubitor-native testnet and mainnet policy is:

- No EOA anywhere.
- Legacy Ethereum transaction types disabled.
- All launch addresses are Qubitor wallet addresses.
- Protocol/admin accounts are Qubitor Accounts or stricter PQ policies.
- Faucet and submitter flows use ML-DSA authorization.
- Public docs and explorer pages must not describe EOA paths as Qubitor-native.

## Acceptance Gate

The transition is not complete until:

```sh
pnpm pq-native:acceptance
pnpm coregeth:test
pnpm contracts:test
pnpm testnet:readiness
```

plus an integration test can start a fresh Qubitor-native network, mine blocks, fund a Qubitor wallet address through PQ policy, submit a PQ-native transaction without any EOA private key, and confirm the receipt.
