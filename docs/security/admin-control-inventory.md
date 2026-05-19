# Admin Control Inventory

## Gate

The exact Qubitor claim is:

> Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts.

The first half is implemented for default Qubitor Accounts. The second half is now stricter: Qubitor-native launch requires **No EOA anywhere**. Any future protocol/admin authority, service account, miner reward recipient, deployer path, or faucet policy must be controlled by a Qubitor wallet address backed by a Qubitor Account or a stricter PQ policy before it can be included in public testnet, mainnet, or marketing claims.

## Qubitor-Native Prohibitions

`QUBITOR_DEPLOYER_PRIVATE_KEY` is prohibited for Qubitor-native launch.
`QUBITOR_FAUCET_PRIVATE_KEY` is prohibited for Qubitor-native launch.
`QUBITOR_PQ_RELAYER_PRIVATE_KEY` is prohibited for Qubitor-native launch.
`QUBITOR_MINER_PRIVATE_KEY` is prohibited for Qubitor-native launch.

These variables may appear only in guardrails that reject or quarantine legacy scaffolding.

## Current Control Surfaces

| Surface | Environment Variable | Current Authority | Signer Mode | Quantum Status | Production Gate |
|---|---|---|---|---|---|
| Genesis system contract installer | none | Installs `SecurityModeRegistry`, `AccountReadinessRegistry`, and `QubitorAccountFactory` into genesis at canonical addresses | PQ Native | devnet proof | Public launch genesis must include the canonical contracts or a stricter PQ-controlled launch ceremony with no EOA deployer |
| PQ native faucet treasury | `QUBITOR_FAUCET_PQ_SEED` | Signs bounded devnet QBT grants as native `QubitorPQTxV1` transfers | PQ Native | devnet proof | Public faucet treasury seeds must live in a hardened signer, Qubitor Account, or stricter PQ policy |
| PQ raw transaction submit gateway | none | Submits wallet-signed `QubitorPQTxV1` raw bytes; cannot sign or pay gas from an EOA | PQ Native | devnet proof | Production submitters must remain submission-only and hold no protocol/admin authority |
| Protocol/admin authority | none in first milestone | No privileged production admin control is deployed in the current contracts | Future PQ Policy | release gate | Any treasury, upgrade, bridge, governance, or emergency authority must be a Qubitor Account or stricter PQ policy |
| PQ admin simulator | none | `QubitorAdminVault` proves treasury movement, faucet hot-wallet top-up, and policy recording through a Qubitor Account | PQ Native | devnet proof only | Replace simulator coverage with a full production inventory before testnet/mainnet claims |
| PQ faucet treasury top-up | none | Devnet faucet grants now spend from the deterministic ML-DSA faucet treasury directly | PQ Native | devnet proof only | Production faucet treasuries must be bounded and refilled only by Qubitor Account control or stricter PQ policy |

The deterministic devnet EOA keys from `.env.example` are known local keys and are not funded in the Qubitor-native genesis. They remain documented only so guardrails can reject them. The faucet, PQ submit gateway, miner reward recipient, and contract installation path no longer use EOA private keys.

## Current Contract Posture

The first milestone contracts are intentionally adminless:

- `QubitorAccount` has no ECDSA owner, no ECDSA admin, and no `onlyOwner` control path.
- `QubitorAccountFactory` has immutable registry addresses and no upgrade/admin method.
- `SecurityModeRegistry` accepts account labels only from `msg.sender == account`.
- `AccountReadinessRegistry` records readiness for `msg.sender`.
- `QubitorAdminVault` is a devnet-only simulator whose privileged functions require `msg.sender` to be the configured Qubitor Account.
- No contract in `contracts/src` may add `Ownable`, `AccessControl`, `DEFAULT_ADMIN_ROLE`, upgrade methods, `delegatecall`, or `selfdestruct` without changing this gate.

## Production Rules

- No EOA anywhere for Qubitor-native launch.
- Legacy EOA keys may exist only in guardrails or explicitly non-native experiments.
- Qubitor-native launch material must use Qubitor wallet addresses for deployer, faucet, submitter, miner reward, treasury, and protocol/admin roles.
- Legacy Ethereum transaction types must be disabled on Qubitor-native networks.
- Any privileged asset movement, treasury policy, bridge policy, upgrade policy, or emergency policy must require PQ authorization.
- Production submitters must be submission-only. They must not pay gas from an EOA and must not sign or custody ML-DSA account-control keys.
- Production faucet hot funds must be bounded and PQ-controlled.
- Before public claims include protocol/admin controls, the inventory must list every privileged path and `pnpm admin:acceptance` must pass.

## Evidence

Run:

```sh
pnpm admin:acceptance
pnpm docs:acceptance
pnpm contracts:test
pnpm devnet:pq-admin-smoke
pnpm devnet:acceptance
```

`pnpm admin:acceptance` checks the inventory, shared chain-config control metadata, devnet key guards, service status labels, deploy-script guardrails, the PQ admin simulator, and Solidity adminless posture.
