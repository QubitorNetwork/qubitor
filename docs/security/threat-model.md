# Qubitor Threat Model

## Scope And Claim

Qubitor's security claim is an account-control claim, not a blanket claim that every possible subsystem is permanently safe.

> Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts.

On the current devnet, this is implemented and tested for default Qubitor Account funds. The protocol/admin part is a release gate: any treasury, upgrade authority, bridge guardian, governance executor, production faucet authority, or other privileged protocol/admin account must use a Qubitor Account or a stricter PQ-controlled policy before it is covered by the public claim. The live inventory is tracked in `docs/security/admin-control-inventory.md`.

Legacy EOA transactions remain allowed only in explicitly non-native local experiments. In Qubitor-native devnet, `QUBITOR_EOA_TXS=0` rejects legacy Ethereum transaction types, system contracts are installed at genesis, and faucet grants/raw submission no longer require relayer/faucet/deployer EOA gas keys.

In the Qubitor-native architecture, **No EOA anywhere** is the rule: every launch address is a Qubitor wallet address, and legacy Ethereum transaction types are disabled.

In this document, quantum-proof means quantum-resistant within this defined threat model using standardized post-quantum signatures. It does not mean impossible to hack, and it does not mean forever quantum-proof.

## Protected Assets

- Default Qubitor Account QBT and token balances.
- The ML-DSA-65 public key that controls each default Qubitor Account.
- PQ key rotation authority for default accounts.
- `PQ Native` security and readiness labels reported by Qubitor account contracts.
- Future protocol/admin controls once those controls are assigned to Qubitor Accounts or stricter PQ-controlled policies.

## Adversary Model

The threat model assumes an attacker may be able to:

- Break ECDSA/secp256k1 signatures or compromise Legacy EOA private keys.
- Submit arbitrary Ethereum transactions to the chain.
- Operate or compromise a relayer, faucet, deployer key, RPC endpoint, or dapp frontend.
- Try replaying signatures across accounts, chains, nonces, or call data.
- Call Qubitor Account methods directly with arbitrary calldata.

The account-control claim assumes the attacker cannot:

- Forge an ML-DSA-65 signature for the account's current PQ public key.
- Break the Qubitor ML-DSA-65 verifier precompile at `0x0000000000000000000000000000000000000100`.
- Extract the user's current ML-DSA private key from the wallet device or encrypted backup.

## Account-Control Controls

`QubitorAccount` has no ECDSA owner, no ECDSA admin key, and no `onlyOwner` fallback control path.

- `executePQ(target,value,data,nonce,signature)` verifies an ML-DSA-65 signature before executing.
- `rotatePQKey(newPublicKey,nonce,signature)` requires authorization from the current ML-DSA key.
- Signed messages include the action domain, `block.chainid`, `address(this)`, the current nonce, and either call details or the new public-key hash.
- The nonce is consumed on successful execution or key rotation, rejecting replay.
- `SecurityModeRegistry` only accepts a mode record when `msg.sender == account`.
- `AccountReadinessRegistry` records readiness for `msg.sender`, so a third party cannot mark another address as `PQ Native`.

ML-DSA is the primary primitive because NIST FIPS 204 standardizes ML-DSA and describes the family as designed for resistance against large-scale quantum adversaries: https://csrc.nist.gov/pubs/fips/204/final

SLH-DSA is the fallback and research track because NIST FIPS 205 standardizes stateless hash-based signatures: https://csrc.nist.gov/pubs/fips/205/final

The initial Go implementation source for the precompile is Cloudflare CIRCL ML-DSA-65: https://pkg.go.dev/github.com/cloudflare/circl/sign/mldsa/mldsa65

Qubitor also vendors Vitalik Buterin's SPHINCS- repository as a hash-based research snapshot at `third_party/sphincsminus`, with the Qubitor fork at https://github.com/Quantx256hash/sphincsminus. This is not a consensus precompile and not a default Qubitor Account signing mode. It exists to evaluate whether a SPHINCS/SLH-DSA-style fallback should become a future account or release-signing option.

## Threat Matrix

| Threat | Impact | Mitigation | Current Status |
|---|---|---|---|
| ECDSA/secp256k1 break | Attacker can forge Legacy EOA transactions | Default accounts do not use ECDSA for account control | Implemented for default accounts; protocol/admin coverage is a release gate |
| Forged `executePQ` authorization | Attacker moves default account funds | ML-DSA-65 verification through the native precompile | Implemented and covered by Go, Foundry, and devnet smoke tests |
| Forged `rotatePQKey` authorization | Attacker takes over a default account | Current PQ key must authorize rotation | Implemented and covered by key-rotation smoke tests |
| Replay on same account | Reuse a valid signature | Per-account nonce is part of the signed message | Implemented |
| Cross-account replay | Reuse a signature on another account | `address(this)` is part of the signed message | Implemented |
| Cross-chain replay | Reuse a signature on another chain | `block.chainid` is part of the signed message | Implemented |
| Registry spoofing | False `PQ Native` readiness label | Security registry requires `msg.sender == account`; readiness records `msg.sender` | Implemented |
| PQ private-key compromise | Attacker signs valid account operations | Rotate to a new PQ key with current-key authorization; recovery policy still needs production design | Partial |
| PQ algorithm break | ML-DSA assumptions fail | Crypto agility and SLH-DSA fallback roadmap | Planned |
| Malicious submit gateway | Gateway submits, withholds, or reorders wallet-signed raw bytes | Wallet signs the native `QubitorPQTxV1`; gateway has no signing authority and no EOA gas key | Implemented for devnet raw gateway |
| Compromised legacy compatibility key | Compatibility key loses only non-native experiment funds or service control | Native networks use genesis/system deployment, PQ faucet treasury, raw submit gateway, and `QUBITOR_EOA_TXS=0` | Covered on native devnet |
| ECDSA-only protocol/admin authority | Attacker controls privileged protocol funds or policy | `QubitorAdminVault` simulator proves treasury, faucet hot-wallet top-up, and policy actions through a Qubitor Account; production authorities must follow that pattern or stricter PQ policy | Devnet simulator implemented |
| Blind signing or malicious dapp request | User signs unexpected target/value/data | Wallet must present action summary, security mode, chain, and data hash before production dapp flows | Partial; first-party wallet smoke covered |
| Precompile implementation bug | Bad verifier result accepts or rejects signatures | Go unit tests, CoreGeth registration tests, Foundry tests, and devnet integration proof | Partial until external audit |
| PoW reorg or 51% attack | Transaction ordering or finality risk | Confirmation policy, mining monitoring, and public hashrate growth | Planned beyond local devnet |
| False security marketing | Users overestimate protection | This threat model, the coverage matrix, and docs acceptance checks define allowed language | Implemented |

## Evidence Gates

These commands are the current local evidence for the claim boundary:

```sh
pnpm docs:acceptance
pnpm admin:acceptance
pnpm research:sphincs-minus:smoke
pnpm coregeth:test
pnpm contracts:test
pnpm devnet:pq-admin-smoke
pnpm devnet:acceptance
```

`pnpm devnet:acceptance` starts the devnet, deploys contracts, starts the RPC gateway, faucet, PQ relayer, indexer, and explorer-lite, runs the node-owned and wallet-owned PQ account flows, proves PQ key rotation, proves encrypted-backup restore, and runs the mobile wallet app and UI smoke tests.
