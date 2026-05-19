# Run The Qubitor Devnet

## Requirements

- Node.js 20+
- PNPM 10+
- Go 1.22+
- Foundry
- CoreGeth-compatible PoW binary, or the local Qubitor CoreGeth fork

Build the local Qubitor CoreGeth fork:

```sh
pnpm coregeth:build
```

`pnpm devnet:start` automatically uses:

```text
build/bin/qubitor-geth
```

Set the node binary manually if you want to run a different compatible fork:

```sh
export QUBITOR_COREGETH_BIN=/path/to/core-geth
```

Modern stock Geth is not a supported default for Qubitor devnet mining because it refuses Ethash sealing on new private networks. A stock-Geth fallback exists only for debugging:

```sh
export QUBITOR_ALLOW_STOCK_GETH_FALLBACK=1
```

That fallback does not include the Qubitor ML-DSA precompile.

## Install

```sh
pnpm install
```

## Start

The local services default to:

```sh
QUBITOR_NETWORK=devnet
```

```sh
pnpm devnet:start
pnpm devnet:health
```

The node RPC listens on:

```text
http://127.0.0.1:8545
```

The RPC gateway listens on:

```sh
pnpm rpc:start
```

```text
http://127.0.0.1:18545/rpc
```

## Deploy Contracts

```sh
pnpm contracts:deploy:devnet
```

The deployment script writes:

```text
contracts/deployments/devnet/deployments.json
```

## PQ Account Smoke Test

Run the full local proof with one command:

```sh
pnpm devnet:acceptance
```

`pnpm devnet:acceptance` starts the devnet if needed, deploys contracts, starts the RPC gateway, faucet, PQ relayer, indexer, and explorer-lite, runs every PQ smoke test below, then stops the processes it started.

It also runs `pnpm docs:acceptance` and `pnpm admin:acceptance`, which check that the threat model, quantum-readiness matrix, and admin-control inventory keep the exact claim boundary aligned with the implemented devnet behavior.

With the devnet running and contracts deployed, each smoke can also be run individually:

```sh
pnpm devnet:pq-smoke
pnpm devnet:pq-admin-smoke
pnpm devnet:explorer-smoke
pnpm devnet:wallet-pq-smoke
pnpm devnet:wallet-pq-rotate-smoke
pnpm devnet:wallet-pq-backup-smoke
pnpm devnet:wallet-app-acceptance
pnpm devnet:wallet-app-ui-smoke
pnpm docs:acceptance
pnpm admin:acceptance
```

This command generates a fresh ML-DSA-65 keypair, deploys a deterministic Qubitor Account, funds it with QBT, signs `executeMessage(...)`, submits `executePQ(...)`, and confirms the account nonce, `PQ Native` registry mode, readiness record, and transfer balance.

`pnpm devnet:pq-admin-smoke` proves the protocol/admin pattern. It deploys a Qubitor Account as the PQ controller for `QubitorAdminVault`, verifies a Legacy EOA cannot record policy directly, then uses ML-DSA-signed `executePQ` calls to record a policy value and transfer treasury funds. When the faucet service is running, that treasury transfer tops up the faucet hot wallet and then a real faucet claim is exercised.

`pnpm devnet:explorer-smoke` verifies that explorer-lite, the RPC gateway, and the indexer expose the live security posture: `PQ Native` default accounts, the ML-DSA precompile, faucet treasury mode, indexed transactions/events, Legacy EOA compatibility labels, and the exact claim boundary.

Explorer-lite also exposes proof views:

```text
http://127.0.0.1:18547/proofs/pq-accounts
http://127.0.0.1:18547/proofs/faucet
http://127.0.0.1:18547/proofs/admin-vaults
```

Each detail view links to a JSON proof bundle from the indexer. Bundles include chain ID, the exact claim boundary, block hashes, transaction hashes, event topics, decoded event fields, and the indexed evidence used by the page.

Bundles can be verified outside the explorer against live RPC state:

```sh
pnpm proofs:verify --rpc http://127.0.0.1:18545/rpc --bundle ./proof.json
```

`pnpm devnet:explorer-smoke` exports one PQ account bundle, one faucet claim bundle, and one admin vault bundle, then runs the proof verifier against the gateway RPC. This checks that every referenced block, transaction, receipt, and log exists on-chain and that admin/faucet privileged evidence includes same-receipt `ExecutedPQ` from the PQ controller.

To keep those artifacts after a run:

```sh
pnpm devnet:proof-pack
```

`pnpm devnet:proof-pack` writes `artifacts/proofs/devnet/<timestamp>/manifest.json`, `pq-account-proof.json`, `faucet-claim-proof.json`, `admin-vault-proof.json`, `verifier-report.json`, `indexer-status.json`, and `acceptance-summary.txt`. Full `pnpm devnet:acceptance` runs this near the end while the RPC gateway, indexer, and explorer are still live.

`pnpm devnet:wallet-pq-smoke` performs the wallet-owned version of the proof. It runs the mobile wallet acceptance path from the Qubitor wallet repo, asks the PQ faucet to fund and deploy the wallet-derived account, then submits a wallet-signed raw `QubitorPQTxV1` that calls `executePQ`. Set `QUBITOR_WALLET_DIR` if the wallet repo is not beside this repo.

`pnpm devnet:wallet-pq-rotate-smoke` proves PQ key lifecycle. It deploys with wallet key A, rotates account control to wallet key B with an ML-DSA authorization from key A, proves key A can no longer authorize `executePQ`, then proves key B can move funds while the native gas authorization remains the deployment ML-DSA key.

`pnpm devnet:wallet-pq-backup-smoke` proves encrypted wallet recovery. It asks the faucet to fund and deploy a wallet-owned account, exports a passcode-encrypted profile, rejects a wrong passcode, restores with the correct passcode, then signs and submits a raw PQ transaction using only the restored ML-DSA key material.

`pnpm devnet:wallet-app-acceptance` runs the mobile wallet acceptance path from the Qubitor wallet repo. It verifies the app-facing chain config, QBT balance label, deployment state, `PQ Native` readiness, faucet funding, and a PQ transaction submitted through the same transfer helper used by the mobile hook. Set `QUBITOR_WALLET_DIR` if the wallet repo is not beside this repo.

`pnpm devnet:wallet-app-ui-smoke` starts Expo Web for the mobile wallet and uses a headless browser to click the visible Home screen controls: `Get QBT`, `Deploy PQ Account`, and `Send PQ Test Transfer`. It saves a final screenshot under `logs/devnet-acceptance/mobile-ui-smoke/`.

## Dev PQ Relayer

For wallet development, start the dev-only PQ relayer:

```sh
pnpm pq-relayer:start
```

It listens on:

```text
http://127.0.0.1:18548
```

The relayer does not own an account-control key or an EOA gas key. The wallet sends its ML-DSA-65 public key to predict the deterministic Qubitor Account, the faucet can fund and deploy it through the canonical factory, and the wallet submits raw `0x04` `QubitorPQTxV1` bytes through `/pq-dev/send-raw`.

## Start Services

```sh
pnpm faucet:start
pnpm rpc:start
pnpm explorer:start
pnpm indexer:start
```

## Persistent Compose Baseline

Phase 6 adds a local persistent compose baseline for testnet-readiness work:

```sh
docker compose -f infra/docker-compose.yml --profile all up --build
```

This targets Qubitor Devnet by default. The public-testnet launch candidate uses `infra/docker-compose.testnet.yml`, but public endpoints still require the release gates in `docs/testnet/readiness.md` before they are advertised.

## CoreGeth Precompile

The local CoreGeth fork registers the Qubitor ML-DSA-65 verifier at:

```text
0x0000000000000000000000000000000000000100
```

The adapter is gated to chain ID `91337` and is covered by:

```sh
pnpm coregeth:test
```
