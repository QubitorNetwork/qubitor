# Qubitor Network Architecture

Qubitor Network is a mineable EVM L1 with standard `0x` addresses and PQ-native Qubitor smart accounts.

Qubitor-native means **No EOA anywhere**. The `0x` address shown to the user must be a Qubitor wallet address, not a legacy externally owned account.

## Layers

- **Node**: CoreGeth-family PoW EVM client configured for Qubitor chain ID `91337` on devnet.
- **Native precompile**: ML-DSA-65 verification at `0x0000000000000000000000000000000000000100`.
- **Contracts**: `QubitorAccount`, `QubitorAccountFactory`, `SecurityModeRegistry`, `AccountReadinessRegistry`, and the devnet-only `QubitorAdminVault` simulator.
- **RPC gateway**: proxies Ethereum JSON-RPC and adds Qubitor helper methods.
- **Faucet**: native QubitorPQTxV1 treasury for bounded local devnet QBT distribution.
- **Explorer-lite**: reads blocks, transactions, addresses, and smart-account code through RPC.

## Default Account Rule

Default Qubitor Accounts are `PQ Native`.

They do not have an ECDSA owner, ECDSA admin key, or legacy `onlyOwner` control path. The account stores an ML-DSA-65 public key and verifies ML-DSA signatures through the native precompile before execution or key rotation.

## Qubitor-Native Reset

The old compatibility testnet is deleted and must not be treated as the production direction. It proved mining, RPC, contracts, and wallet integration, but it still depended on EOA gas payers.

The active devnet milestone is the PQ-native transaction layer documented in `docs/architecture/pq-native-transaction-layer.md`. It makes the Qubitor wallet address the sender, charges gas to the Qubitor Account balance, installs account system contracts at genesis, and disables legacy Ethereum transaction types on Qubitor-native networks.

## Native Boundary

Qubitor-native devnet runs with:

- genesis/system deployment for account contracts
- `QubitorPQTxV1` for faucet, raw wallet submission, and smart-account deployment gas
- miner rewards sent to a Qubitor wallet address
- `QUBITOR_EOA_TXS=0` for legacy transaction rejection

Legacy EOA tooling may exist only in explicitly non-native experiments and guardrails. It is not part of the default Qubitor Account model.

## Hash-Based PQ Research

Qubitor vendors Vitalik Buterin's SPHINCS- snapshot under `third_party/sphincsminus` and tracks the Qubitor fork at `https://github.com/Quantx256hash/sphincsminus`.

This is research code only. It is useful for evaluating a future SPHINCS/SLH-DSA-style fallback, but it is not currently registered in CoreGeth, not accepted by `QubitorAccount`, and not used by wallet defaults. The local evidence command is:

```sh
pnpm research:sphincs-minus:smoke
```

## PQ Admin Simulator

`QubitorAdminVault` is a devnet-only proof contract for future protocol/admin controls. Its treasury and policy functions require `msg.sender` to be a configured Qubitor Account, so a non-controller sender cannot execute privileged actions. `pnpm devnet:pq-admin-smoke` proves those actions through ML-DSA authorization and `executePQ`; when the faucet service is running, it also uses the PQ vault to top up the faucet hot wallet before exercising a faucet claim.

## Current Devnet Registration

The Qubitor-owned verifier lives in Go at:

```text
clients/qubitor-node/precompile/mldsa65
```

The local CoreGeth fork registers it through:

```text
clients/qubitor-node/coregeth/core/vm/contracts_qubitor.go
```

That adapter exposes the verifier at `0x0000000000000000000000000000000000000100` for Qubitor devnet chain ID `91337`, decodes `(bytes publicKey, bytes message, bytes context, bytes signature)`, and returns `(bool valid)`.

The stock-Geth fallback documented for debugging does not include this precompile. The supported devnet path is the local Qubitor CoreGeth fork and is covered by `pnpm coregeth:test` and `pnpm devnet:acceptance`.
