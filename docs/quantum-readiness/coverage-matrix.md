# Quantum-Readiness Coverage Matrix

## Exact Claim

> Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts.

This claim is true for default Qubitor Account funds on the current devnet because account execution and key rotation require ML-DSA-65 authorization. The protocol/admin part is a release gate: privileged production controls must be Qubitor Accounts or stricter PQ-controlled policies before the claim applies to those controls. The current inventory is tracked in `docs/security/admin-control-inventory.md`.

Qubitor-native devnet now removes EOA deployer, faucet, relayer, and miner keys from the live flow. The rule is **No EOA anywhere**: Qubitor wallet addresses are the only sender/control addresses in the native path, and legacy Ethereum transaction types are disabled with `QUBITOR_EOA_TXS=0`.

## Current Coverage

| Surface | ECDSA Break Impact | PQ Control | Current Proof | Claim Status |
|---|---|---|---|---|
| Default Qubitor Account funds | ECDSA alone cannot authorize a transfer | `executePQ` requires ML-DSA-65 via precompile `0x0000000000000000000000000000000000000100` | `pnpm contracts:test`, `pnpm devnet:pq-smoke`, `pnpm devnet:wallet-pq-smoke` | Covered on devnet |
| PQ account execution | EOA or relayer key compromise cannot create a valid account operation | Signed message binds domain, chain ID, account, nonce, target, value, and data hash | Foundry tests plus devnet transfer receipts | Covered on devnet |
| PQ key rotation | ECDSA alone cannot replace the account key | `rotatePQKey` requires the current ML-DSA-65 key | `pnpm devnet:wallet-pq-rotate-smoke` | Covered on devnet |
| Deterministic account factory | ECDSA cannot deploy or control the default account in the native flow | Genesis installs the factory; a PQ wallet funds/deploys counterfactual accounts with `QubitorPQTxV1` | `pnpm contracts:deploy:devnet`, `pnpm devnet:pq-smoke` | Covered on devnet |
| Security mode registry | ECDSA cannot label another account as `PQ Native` | `SecurityModeRegistry.recordMode` requires `msg.sender == account` | `pnpm contracts:test` and devnet smoke assertions | Covered on devnet |
| Account readiness registry | Third parties cannot mark another address as ready | `AccountReadinessRegistry.recordPQNative` records `msg.sender` | `pnpm contracts:test` and wallet acceptance reads | Covered on devnet |
| Mobile wallet default flow | User funds are moved by wallet ML-DSA signing, not ECDSA signing | Wallet displays QBT, deployment state, and `PQ Native`, then submits PQ-signed transfer through the relayer | `pnpm devnet:wallet-app-acceptance`, `pnpm devnet:wallet-app-ui-smoke` | Covered on devnet |
| PQ-native transaction layer | ECDSA cannot create the Qubitor-native sender or submit through `qubitor_sendRawPQTransaction` | CoreGeth validates `QubitorPQTxV1` with ML-DSA, binds the account address to the public key and salt, and charges gas to the Qubitor Account | `pnpm pq-native:acceptance`, `pnpm coregeth:test`, `pnpm devnet:pq-native-raw-smoke` | Initial devnet proof |
| Encrypted wallet backup | ECDSA break does not unlock a PQ account backup | Restored profile must decrypt the ML-DSA key and produce a valid PQ signature | `pnpm devnet:wallet-pq-backup-smoke` | Covered on devnet |
| Legacy EOA transactions | ECDSA break can spend EOAs only on non-native compatibility experiments | Disabled at RPC and txpool when `QUBITOR_EOA_TXS=0`; not funded in native devnet genesis | `pnpm pq-native:acceptance`, live EOA rejection smoke | Excluded from Qubitor-native flow |
| Deployer, faucet, and relayer gas keys | ECDSA break has no live native-flow key to exploit | Genesis system install, faucet PQ treasury, and raw submit gateway remove EOA gas-payer keys | `pnpm contracts:deploy:devnet`, faucet/relayer native smokes | Covered on devnet |
| PQ admin simulator | ECDSA alone cannot call simulated treasury, faucet top-up, or policy controls | `QubitorAdminVault` requires `msg.sender` to be a Qubitor Account controlled by ML-DSA | `pnpm contracts:test`, `pnpm devnet:pq-admin-smoke` | Covered as devnet proof |
| Protocol/admin accounts | Any ECDSA-only privileged key would violate the public claim | Must use Qubitor Accounts or stricter PQ policies before production authority exists | Not deployed as privileged production controls in this milestone | Release gate |
| Mining consensus | ECDSA break does not directly control account execution, but PoW reorgs affect finality | PoW security is separate from PQ account security | `pnpm coregeth:test` plus devnet mining acceptance | Separate consensus risk |
| Bridges and external guardians | ECDSA-only guardians would violate the claim | PQ or hybrid guardian design required | Not built | Future release gate |
| Release signing | Classical-only release signing is a supply-chain risk | ML-DSA or SLH-DSA release signing roadmap | Not built | Future release gate |

## Primitive Coverage

- ML-DSA-65 is the primary account-control primitive. NIST FIPS 204 standardizes ML-DSA: https://csrc.nist.gov/pubs/fips/204/final
- SLH-DSA is the fallback and research track. NIST FIPS 205 standardizes SLH-DSA: https://csrc.nist.gov/pubs/fips/205/final
- The devnet verifier uses Cloudflare CIRCL ML-DSA-65 through the Qubitor precompile: https://pkg.go.dev/github.com/cloudflare/circl/sign/mldsa/mldsa65
- SPHINCS- is vendored only as a hash-based research track from https://github.com/vbuterin/sphincsminus and mirrored in the Qubitor fork at https://github.com/Quantx256hash/sphincsminus. It is not a default account-control primitive or a consensus precompile. See `docs/quantum-readiness/sphincs-minus-track.md`.

## Accepted Public Language

Use:

- quantum-resistant default accounts
- PQ-native Qubitor Accounts
- ECDSA compromise alone cannot move default Qubitor Account funds
- Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts.

Avoid:

- impossible to hack
- forever quantum-proof
- every subsystem is fully PQ-native today
- Legacy EOA accounts are quantum-resistant

## Required Evidence Before Broad Claims

Run these before presenting the devnet claim:

```sh
pnpm docs:acceptance
pnpm admin:acceptance
pnpm research:sphincs-minus:smoke
pnpm coregeth:test
pnpm contracts:test
pnpm devnet:pq-admin-smoke
pnpm devnet:acceptance
```

Before production or public testnet claims include protocol/admin controls, every privileged control path must be inventoried and moved to Qubitor Account control or an explicitly stronger PQ policy.
