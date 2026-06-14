# Qubitor Testnet Readiness

> Engineering-only document. Prohibited environment variable names are listed
> here as readiness guardrails, not as public miner/operator setup steps and not
> as live secret values.

Phase 6 is the bridge from local proof to public testnet. The rule is still:

> Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts.

The current compatibility testnet has been deleted. We are restarting from devnet because Qubitor-native means **No EOA anywhere** and every public address must be a Qubitor wallet address.

Public testnet cannot be announced until every item below is implemented. EOA-based deployer, faucet, relayer, and miner keys are not allowed to be marked out of scope for a Qubitor-native launch.

`QUBITOR_DEPLOYER_PRIVATE_KEY` is prohibited for Qubitor-native launch.
`QUBITOR_FAUCET_PRIVATE_KEY` is prohibited for Qubitor-native launch.
`QUBITOR_PQ_RELAYER_PRIVATE_KEY` is prohibited for Qubitor-native launch.
`QUBITOR_MINER_PRIVATE_KEY` is prohibited for Qubitor-native launch.

## Readiness Gate

Run the static readiness gate:

```sh
pnpm testnet:readiness
```

The gate checks that:

- services select `devnet`, `testnet`, or `mainnet` through `QUBITOR_NETWORK`.
- the CoreGeth ML-DSA precompile gate includes the public testnet chain ID `91338`.
- the launch-candidate genesis lives at `clients/qubitor-node/config/testnet/genesis.json`.
- the launch-candidate genesis embeds bridge system contracts `0x0000000000000000000000000000000000000301`, `0x0000000000000000000000000000000000000302`, and `0x0000000000000000000000000000000000000303`.
- the launch-candidate bootnode manifest lives at `clients/qubitor-node/config/testnet/bootnodes.json`.
- Docker Compose uses the local Qubitor CoreGeth fork, not a generic CoreGeth image.
- Node data, indexer data, and proof artifacts have persistent paths.
- RPC gateway, faucet, PQ relayer, indexer, explorer-lite, and proof-pack services are represented.
- `pnpm devnet:acceptance` still writes a verified proof pack.
- testnet runtime material sets `QUBITOR_EOA_TXS=0` and contains no EOA private-key variables.
- generated PQ service-wallet material contains the faucet/miner treasury addresses used by the runtime env.
- generated bootnode material can describe one or more public bootnodes with distinct advertised endpoints.
- public deploy scripts are checked by `pnpm testnet:deploy-safety` so they cannot silently reset `data/node/testnet`.
- testnet snapshot and height-monitor scripts exist for daily backups and block-height drop detection.
- peer/miner diversity can be checked with `pnpm testnet:peer-diversity:check`.
- public firewall and exposed-service expectations are documented in `docs/testnet/firewall-and-public-surface.md`.
- the admin-control inventory keeps protocol/admin authority behind Qubitor Accounts or stricter PQ policy.

## Compose Baseline

Services default to the devnet profile. Select another profile explicitly:

```sh
QUBITOR_NETWORK=devnet
QUBITOR_NETWORK=testnet
```

Local persistent service stack:

```sh
docker compose -f infra/docker-compose.yml --profile all up --build
```

One-shot proof pack after the service stack has produced PQ evidence:

```sh
docker compose -f infra/docker-compose.yml --profile proofs run --rm proof-pack
```

Compose is still a devnet baseline. Public testnet needs a frozen testnet genesis, bootnodes, and a CoreGeth precompile gate for the public testnet chain ID before it can be advertised.

The testnet override is wired separately:

```sh
docker compose -f infra/docker-compose.yml -f infra/docker-compose.testnet.yml --profile all up --build
```

For public HTTPS endpoints, add the Caddy override after launch preflight passes:

```sh
docker compose -f infra/docker-compose.yml -f infra/docker-compose.testnet.yml -f infra/docker-compose.public.yml --profile all up --build
```

The public override routes `testrpc.qubitor.org` to the RPC gateway, `/pq-dev/*` to the raw PQ submit gateway, and `/faucet/*` to the faucet API. The wallet uses `https://testrpc.qubitor.org/rpc` for JSON-RPC and the same origin for faucet/PQ submission. `testexplorer.qubitor.org` routes to Explorer Lite. Bootnode 2 can run the same public stack at `https://testrpc2.qubitor.org/rpc` and `https://testexplorer2.qubitor.org` with the secondary RPC scripts. During DNS propagation, keep temporary rehearsal hostnames in `QUBITOR_PUBLIC_RPC_ALIASES`, `QUBITOR_PUBLIC_EXPLORER_ALIASES`, and `QUBITOR_PUBLIC_FAUCET_ALIASES`.

Do not run the override as a public service until the launch preflight passes with real values.

Generate per-host launch material with:

```sh
pnpm testnet:material:generate
```

The checked-in `.env.testnet.example` is only for dedicated Ubuntu server login details. Copy it to `.env.testnet` or `.env.testnet.local`; both private filenames are ignored by git. The material generator loads `.env.testnet` first, then `.env.testnet.local`, unless `QUBITOR_TESTNET_SERVER_ENV_FILE` is set. Runtime material is generated on the server under `artifacts/testnet/launch/<timestamp>/` and is intentionally ignored by git because it contains testnet hot PQ material. It sets `QUBITOR_EOA_TXS=0`, writes `pq-service-keys.json`, writes node-specific `node-env/bootnode-*.env` files, sets Docker bind paths such as `QUBITOR_GENESIS_HOST_FILE`, defaults public URLs to Qubitor.org testnet hostnames, and does not generate deployer, faucet, relayer, or miner EOA private keys. The generator uses `QUBITOR_TESTNET_SERVER_HOST` as the first advertised bootnode host and `QUBITOR_TESTNET_BOOTNODE_2_HOST` as the optional second advertised bootnode host when no `QUBITOR_BOOTNODE_PUBLIC_HOSTS` override is set. For a multi-bootnode rehearsal, set `QUBITOR_BOOTNODE_MIN_COUNT`, optional per-node TCP/UDP port lists, or an explicit `QUBITOR_BOOTNODE_PUBLIC_HOSTS` list. See `docs/testnet/launch-material.md`.

Verify the bridge genesis before and after boot:

```sh
pnpm testnet:bridge-genesis:verify
QUBITOR_TESTNET_VERIFY_RPC_URL=http://127.0.0.1:8545 pnpm testnet:bridge-genesis:verify
```

Live testnet operations are no-reset by default. Do not delete chain data, replace
genesis, wipe node data, or rewrite the chain during hardening work. Emergency
reset notes live separately in `docs/testnet/break-glass-reset.md` and are not
part of normal readiness or deploy flow.

After bootnode 2 is synced, promote it into a secondary public RPC without
resetting chain data:

```sh
pnpm testnet:secondary-rpc:deploy
pnpm testnet:secondary-rpc:status
```

The command reuses the latest generated launch material, sources
`node-env/bootnode-2.env`, applies the `testrpc2.qubitor.org` and
`testexplorer2.qubitor.org` public URL overrides, and starts the public chain
services on the second host.

## Operations Guards

Before changing public services, run the no-reset deploy guard:

```sh
pnpm testnet:deploy-safety
```

To ship non-secret repo changes to the live hosts and restart only Explorer Lite:

```sh
pnpm testnet:ops-code:deploy
```

To ship RPC hardening and restart only the public gateway/RPC gateway:

```sh
pnpm testnet:ops-code:deploy-rpc-hardening
```

This sync excludes `.env*`, generated launch material, chain data, logs,
snapshots, and build caches.

Install daily server snapshots on both testnet hosts:

```sh
pnpm testnet:snapshot:install-cron
pnpm testnet:snapshot:run
pnpm testnet:snapshot:status
```

Snapshots are written under `backups/testnet-snapshots/<timestamp>/<host>/`.
They include a manifest, Docker inventory, live node/indexer/Caddy archives,
a best-effort CoreGeth chain export, and a bridge Postgres dump when the bridge
database container is present. To pull snapshots back to this workstation:

```sh
pnpm testnet:snapshot:pull
```

Install the block-height monitor on both hosts:

```sh
pnpm testnet:height-monitor:install-cron
pnpm testnet:height-monitor:run
pnpm testnet:height-monitor:status
```

The monitor records the current height and genesis hash in
`data/monitor/testnet-height.state`. It writes alerts to
`data/monitor/testnet-height-alerts.log` if the node reports a lower height than
the previous sample, if the genesis hash changes, or if blocks stop advancing.

Check public peer and recent miner diversity without changing chain state:

```sh
pnpm testnet:peer-diversity:check
```

The check reads the public RPC endpoints, compares primary/secondary height lag,
compares block hashes at a finalized sample height, samples recent block
coinbase addresses, and fails when the configured peer, hash-agreement, or miner
diversity thresholds are not met. For dashboards that should collect the same
evidence without failing the shell, set `QUBITOR_PEER_DIVERSITY_WARN_ONLY=1`.

If official nodes split or mine while isolated, repair peering without resetting
or rewriting chain data:

```sh
pnpm testnet:peer-repair:status
pnpm testnet:peer-repair
pnpm testnet:peer-guard:install
```

The repair workflow reads both official nodes, chooses the highest-total-
difficulty head, stops mining on isolated/lower-total-difficulty nodes, adds the
official enodes as persistent peers through local admin RPC, waits for block-hash
agreement, and only then resumes mining. It must not run `geth init`, delete
`data/node/testnet`, replace genesis, or move node data.

`peer-guard` runs privately beside the node and keeps required peers connected.
If peer count drops below `QUBITOR_MIN_PEERS_BEFORE_MINE`, or public RPCs disagree
on finalized block hashes, it pauses mining until the node is safe to mine again.

If diversity is below the launch threshold, add a separate auxiliary miner/full
node without touching either live bootnode data directory:

```sh
pnpm testnet:aux-miner:deploy secondary
pnpm testnet:aux-miner:status secondary
```

The auxiliary miner uses `infra/docker-compose.aux-miner.yml`, a distinct
`data/node/testnet-aux-miner-*` directory, and a separate generated PQ reward
wallet under ignored private artifacts. It never mounts `data/node/testnet`.
It may initialize its own empty auxiliary data directory, but it must not run
`geth init` against the live bootnode data path.
Auxiliary miners start sync-only by default. Set
`QUBITOR_AUX_MINER_START_MINING=1` only after the node has the official genesis,
at least one official peer, and matching block hashes with the public RPCs.

After the testnet node is mining, bootstrap only verifies that PoW rewards have reached the PQ miner/faucet treasury:

```sh
QUBITOR_TESTNET_ENV_FILE=artifacts/testnet/launch/<timestamp>/.env.testnet.local pnpm testnet:bootstrap-funds
```

## Launch Preflight

Use a local, non-committed env file with real values:

```sh
QUBITOR_TESTNET_ENV_FILE=.env.testnet.local pnpm testnet:launch-preflight
```

The launch preflight fails if:

- `QUBITOR_NETWORK` is not `testnet`.
- `QUBITOR_EOA_TXS=0` is missing.
- public RPC, explorer, or faucet URLs are placeholders or non-HTTPS.
- any deployer, faucet, relayer, or miner EOA private-key variable is present.
- `QUBITOR_FAUCET_PQ_SEED` reuses the deterministic devnet seed.
- `QUBITOR_PQ_SERVICE_KEYS_FILE` is missing or does not match the faucet/miner runtime addresses.
- `QUBITOR_BOOTNODES` or `clients/qubitor-node/config/testnet/bootnodes.json` has fewer than `QUBITOR_BOOTNODE_MIN_COUNT` real public `enode://` or `enr:` entries.
- any `enode://` bootnode advertises a private host or duplicates another advertised host/port.
- `QUBITOR_FAUCET_TREASURY_MODE` is not `pq-controlled-testnet`.
- `QUBITOR_FAUCET_TREASURY_VAULT` or `QUBITOR_MINER_ETHERBASE` is missing.
- the CoreGeth precompile gate does not include chain ID `91338`.

## Public Testnet Release Gates

Before a public testnet claim:

- Implement the PQ-native transaction layer in `docs/architecture/pq-native-transaction-layer.md`.
- Disable legacy Ethereum transaction types on Qubitor-native networks.
- Ensure every launch address is a Qubitor wallet address.
- Freeze chain ID, genesis, bootnodes, gas policy, and faucet limits.
- Remove deployer, faucet, relayer, and miner EOA private keys from launch material.
- Put faucet treasury refill and any protocol/admin control behind a Qubitor Account or stricter PQ policy.
- Publish RPC, explorer, faucet, and proof-pack URLs.
- Produce and retain a verified proof pack for the public testnet launch.
- Update `docs/security/admin-control-inventory.md` with every privileged path.
- Pass `pnpm test`, `pnpm testnet:readiness`, and the public-testnet acceptance runbook.

## Non-Claims

Phase 6 does not yet mean mainnet readiness. It also does not mean the chain is impossible to break or forever quantum-proof. The claim remains scoped to the documented account-control threat model and verified evidence.
