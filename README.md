# Qubitor Network

Qubitor Network is a separate chain/backend workspace for a mineable EVM L1 with PQ-native Qubitor smart accounts.

Qubitor-native means **No EOA anywhere**. The canonical user, service, miner reward, treasury, and protocol/admin address is a Qubitor wallet address backed by a Qubitor Account or a stricter PQ policy.

This repository is intentionally separate from the Qubitor Wallet repo. It owns the L1 devnet, shared chain metadata, smart-account contracts, node-specific cryptography code, lightweight RPC/faucet/indexer services, and protocol documentation.

## First Milestone

The first local milestone is:

- a local Qubitor devnet with chain ID `91337`
- native gas coin `QBT`
- PoW/CoreGeth-family node configuration
- standard Ethereum JSON-RPC
- Qubitor RPC helper methods through the gateway
- a local CoreGeth fork with the native ML-DSA-65 verifier precompile at `0x0000000000000000000000000000000000000100`
- PQ-only default Qubitor smart accounts
- deterministic account factory deployment
- faucet, dev PQ relayer, indexer, and explorer-lite service surfaces

The default account model is not ECDSA. Qubitor Accounts are `0x` smart accounts controlled by ML-DSA authorization.

The previous testnet scaffold that used service EOAs has been discarded. It is not the final Qubitor architecture. The devnet now uses the PQ-native transaction layer in `docs/architecture/pq-native-transaction-layer.md`: Qubitor wallet addresses submit and pay for transactions with ML-DSA authorization, canonical account contracts are installed at genesis, and legacy Ethereum transaction types are disabled on Qubitor-native networks.

## Commands

```sh
pnpm install
pnpm typecheck
pnpm docs:acceptance
pnpm admin:acceptance
pnpm testnet:readiness
pnpm research:sphincs-minus:smoke
pnpm proofs:verify --help
pnpm test
pnpm contracts:build
pnpm contracts:test
pnpm go:test
pnpm coregeth:test
pnpm devnet:health
```

Build the local Qubitor CoreGeth fork, then run the full local proof:

```sh
pnpm coregeth:build
pnpm devnet:acceptance
```

For manual devnet work:

```sh
pnpm devnet:start
pnpm contracts:deploy:devnet
pnpm rpc:start
pnpm faucet:start
pnpm pq-relayer:start
pnpm explorer:start
pnpm devnet:pq-smoke
pnpm devnet:pq-admin-smoke
pnpm devnet:explorer-smoke
pnpm devnet:proof-pack
pnpm devnet:wallet-pq-smoke
pnpm devnet:wallet-pq-rotate-smoke
pnpm devnet:wallet-pq-backup-smoke
pnpm devnet:wallet-app-acceptance
pnpm devnet:wallet-app-ui-smoke
pnpm devnet:stop
pnpm devnet:reset
```

Explorer-lite proof views are available when `pnpm explorer:start` and `pnpm indexer:start` are running:

```text
http://127.0.0.1:18547/proofs/pq-accounts
http://127.0.0.1:18547/proofs/faucet
http://127.0.0.1:18547/proofs/admin-vaults
```

Each detail view links to a downloadable JSON proof bundle. To verify a bundle independently against live RPC state:

```sh
pnpm proofs:verify --rpc http://127.0.0.1:18545/rpc --bundle ./proof.json
```

To export a durable, verified devnet evidence folder:

```sh
pnpm devnet:proof-pack
```

The proof pack is written under `artifacts/proofs/$QUBITOR_NETWORK/<timestamp>/` (default `devnet`) with `manifest.json`, the three proof bundles, `verifier-report.json`, `indexer-status.json`, and `acceptance-summary.txt`.

## Hash-Based PQ Research

Vitalik Buterin's SPHINCS- snapshot is vendored under `third_party/sphincsminus` and forked for Qubitor at `https://github.com/Quantx256hash/sphincsminus`.

This is not consensus code and is not a default Qubitor Account signing mode. It is the hash-based fallback research track for future SPHINCS/SLH-DSA evaluation.

```sh
pnpm research:sphincs-minus:smoke
```

## Phase 6: Testnet Readiness

Phase 6 was the compatibility scaffold gate. We are resetting back to devnet before a new public testnet because Qubitor-native launch requires **No EOA anywhere**:

```sh
pnpm testnet:readiness
```

Services select their runtime profile with:

```sh
QUBITOR_NETWORK=devnet
QUBITOR_NETWORK=testnet
```

The checklist and release gates live in `docs/testnet/readiness.md`. The Docker Compose baseline in `infra/docker-compose.yml` remains useful for local service wiring, but public testnet is blocked until the new PQ-native devnet proof is repeated with dedicated bootnodes and launch material.

The next gate before public endpoints are advertised is:

```sh
QUBITOR_TESTNET_SERVER_HOST=66.29.136.165 pnpm testnet:material:generate
QUBITOR_TESTNET_ENV_FILE=artifacts/testnet/launch/<timestamp>/.env.testnet.local pnpm testnet:launch-preflight
```

`.env.testnet.example` is only for dedicated server login details. Copy it to `.env.testnet` or `.env.testnet.local`; both private filenames are ignored by git. The material generator loads `.env.testnet` first, then `.env.testnet.local`, unless `QUBITOR_TESTNET_SERVER_ENV_FILE` is set. The generated runtime env lives under `artifacts/testnet/launch/<timestamp>/`, sets `QUBITOR_EOA_TXS=0`, includes PQ service wallet material only, and stays out of git. For a second bootnode, add only the second server access values with `QUBITOR_TESTNET_BOOTNODE_2_HOST` in your local env, then generate with `QUBITOR_BOOTNODE_MIN_COUNT=2`. For larger multi-bootnode rehearsals, generate material with `QUBITOR_BOOTNODE_PUBLIC_HOSTS` and set `QUBITOR_BOOTNODE_MIN_COUNT` to the launch policy you want preflight to enforce.

Set `QUBITOR_COREGETH_BIN` only if you want to run a different CoreGeth-compatible binary.

## Important Boundary

The devnet claim is intentionally scoped: breaking ECDSA/secp256k1 alone cannot move funds from default Qubitor Accounts because their execution path requires an ML-DSA-65 signature verified by the Qubitor precompile. The broader public claim is tracked in `docs/security/threat-model.md` and `docs/quantum-readiness/coverage-matrix.md`.

Legacy EOA usage is outside the Qubitor-native flow. Native devnet/testnet/mainnet must use Qubitor wallet addresses, genesis/system contract installation, and rejected legacy Ethereum transaction types. Run `pnpm pq-native:acceptance` to check this boundary.
