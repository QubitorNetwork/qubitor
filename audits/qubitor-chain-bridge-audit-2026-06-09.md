# Qubitor Chain + Bridge Internal Audit

Date: 2026-06-09

Scope:
- QubitorNetwork chain/node surfaces: CoreGeth fork, PoW config, genesis, system contracts, RPC gateway, faucet, PQ submitter, explorer/indexer, SDK chain metadata, testnet operations scripts.
- Qubitor account and PQ transaction surfaces: ML-DSA precompile, `QubitorPQTxV1`, `QUBITOR_EOA_TXS=0`, Qubitor Account contracts, account/security registries, Qubitor-native admin/control policy.
- Bridge surfaces affecting chain safety: Qubitor bridge system contracts, Sepolia deployment metadata, bridge relayer/indexer/monitor/finalizer, guardian mode, finality/reorg handling, liquidity and message status.

Out of scope:
- This report is not an external security audit.
- No mutations were performed during live checks. No resets, restarts, migrations, deployments, file edits, or transactions were executed as part of live evidence collection.
- Wallet, website, Discord tooling, and whitepaper are referenced only where they affect chain or bridge security claims.

## Executive Summary

Mainnet readiness status: **Fail**

Qubitor testnet is live, producing blocks, and both public RPC hostnames report chain ID `91338`, the same genesis hash, the same head, and non-empty code for Qubitor account and bridge system contracts. The local QubitorNetwork gates passed, including CoreGeth tests, PQ-native acceptance, bridge genesis verification, and Qubitor Account contract tests.

The bridge stack is deployed and running in execute mode with Postgres/Redis durability, threshold guardian mode reported by the live relayer, and watchers enabled in both directions. However, bridge readiness is currently blocked by a Sepolia RPC quota outage, failed mainnet gate criteria, missing/unchecked Sepolia Safe ownership evidence, and failed soak evidence.

The most urgent chain-side issue is that the public RPC gateway currently forwards privileged namespaces. Both public RPC endpoints accepted `admin_nodeInfo` and `debug_verbosity`. Public endpoints should expose only standard public Ethereum/Qubitor RPC methods, never admin/debug/personal/miner/txpool surfaces.

Top blockers before mainnet:
1. Block public RPC access to `admin_*`, `debug_*`, `personal_*`, `miner_*`, `txpool_*`, and any non-public method namespace.
2. Restore bridge API health by replacing or adding Sepolia RPC failover capacity; `/bridge/liquidity` and `/bridge/fees` currently return 400 due provider quota exhaustion.
3. Produce passing bridge soak evidence: at least 20 consecutive testnet runs, both directions, no failures, distinct amounts/recipients.
4. Verify Sepolia bridge ownership is behind Safe/multisig/timelock and remove deployer EOA ownership/role paths from production posture.
5. Reconcile bridge deployment metadata with live threshold guardian mode and on-chain reads.
6. Run external audits for chain consensus/PQ precompile/account contracts/bridge contracts/relayer before real mainnet funds.

## Positive Evidence

- `QubitorNetwork` local gates passed: build, typecheck, tests, testnet readiness, bridge genesis verification, PQ-native acceptance, CoreGeth tests, and contract tests.
- `qubitor-bridge` local build, typecheck, tests, and contract tests passed.
- Primary and secondary public RPCs report:
  - chain ID: `0x164ca` (`91338`)
  - syncing: `false`
  - same genesis hash: `0x8c422f1572daf17ff4b699c98db0b1d72a71bf9ef0f8cb926b1a15b4a3f33483`
  - same observed height during audit: `107052` to `107058`
  - same latest hash in the remote height monitor output at `107058`
- Genesis/live code checks show non-empty runtime code for:
  - `0x0000000000000000000000000000000000000201` SecurityModeRegistry
  - `0x0000000000000000000000000000000000000202` AccountReadinessRegistry
  - `0x0000000000000000000000000000000000000203` QubitorAccountFactory
  - `0x0000000000000000000000000000000000000301` QubitorBridgeMessageRegistry
  - `0x0000000000000000000000000000000000000302` QubitorBridgeGuardianVerifier
  - `0x0000000000000000000000000000000000000303` QubitorNativeBridgeVault
- The ML-DSA precompile address `0x0000000000000000000000000000000000000100` returns empty code by `eth_getCode`, which is normal for native precompiles. Qubitor network security status and local tests identify it as `QBT_ML_DSA_65_VERIFY`.
- Public faucet and PQ submitter status report:
  - `signerMode: "PQ Native"`
  - accepted transaction type `0x04`
  - `legacyGasPayer: false`
  - wallet-owned ML-DSA signing model
- Bridge services are running with local-only service ports and report:
  - relayer `mode: execute`
  - `watchersEnabled: true`
  - directions `qubitor-to-ethereum` and `ethereum-to-qubitor`
  - finality `32` Sepolia confirmations and `50` Qubitor confirmations
  - guardian mode `threshold`
  - Postgres and Redis configured
  - zero pending and zero failed messages at the time of status check
- Daily testnet snapshots exist on both nodes, and height monitors reported matching chain height and latest hash.

## Findings

| ID | Severity | Component | Finding | Impact | Evidence | Recommended Fix |
| --- | --- | --- | --- | --- | --- | --- |
| QCB-001 | Critical | Public RPC gateway | Public RPC forwards privileged namespaces. `admin_nodeInfo` and `debug_verbosity` succeeded on both public RPC endpoints. | Exposes node identity/network metadata and may expose unsafe debug/admin behavior if additional methods are reachable. This violates public RPC hardening requirements. | Live JSON-RPC checks against both public RPC hostnames returned result objects for `admin_nodeInfo` and a successful `debug_verbosity` response. Static code shows `services/rpc-gateway/src/index.ts` forwards any method not handled by `handleQubitorMethod` to upstream. | Add a strict public RPC allowlist in the gateway. Reject `admin_*`, `debug_*`, `personal_*`, `miner_*`, `txpool_*`, `engine_*`, and any non-public namespace by default. Add tests that these methods return JSON-RPC errors. Also restrict upstream node APIs to public modules only. |
| QCB-002 | High | Bridge API and Sepolia provider | Bridge API live reads are degraded because the configured Sepolia RPC provider exceeded its quota. `/bridge/liquidity` and `/bridge/fees` return HTTP 400. Monitor and finalizer report degraded errors for Sepolia `eth_call`/`eth_blockNumber`. | The frontend cannot reliably quote liquidity/fees. Relayer, monitor, and finalizer lose live Sepolia visibility, which can block or delay bridge execution and alerting. | `pnpm bridge:readiness:testnet` failed with `https://api.0xq.app/bridge/liquidity returned 400`. Live endpoint checks showed provider quota errors from the Sepolia RPC URL. `pnpm bridge:mainnet:gate` included degraded monitor/finalizer errors from the same provider. | Add Sepolia RPC failover and quota headroom. The API should serve cached last-known liquidity with a degraded flag rather than hard-failing read-only routes. Monitor should alert on provider exhaustion. |
| QCB-003 | High | Bridge readiness | Bridge mainnet gate fails because the latest soak evidence is not a passing 20-run artifact. The recorded latest soak completed 1 of 20 requested runs and failed that run. | Bridge cannot be considered production-ready. There is no evidence that repeated automatic execution works both directions under current deployment. | `pnpm bridge:mainnet:gate` returned `ok: false` and failure `latest bridge soak must pass at least 20 runs with zero failures`. The soak run failed on `bridgeToQubitor` with an execution revert. | Fix the reverted bridge path, run a fresh testnet soak with at least 20 passing runs, preserve the artifact, and require it in CI/mainnet gate. |
| QCB-004 | High | Sepolia bridge admin | Sepolia deployment metadata does not include verified Safe/multisig ownership data, and the mainnet gate could not verify owner sets locally. Scripts still grant deployer roles during deployment. | A raw deployer EOA may still have privileged bridge authority unless ownership and roles have been transferred and verified. This conflicts with the no raw deployer owner requirement. | `deployments/sepolia.json` contains `deployer` and contracts/safety sections but no `admin.sepoliaSafe` section. `pnpm bridge:mainnet:gate` warns `SEPOLIA_SAFE_OWNER_ADDRESSES is not set, so owner-set verification cannot run locally`. Deployment scripts grant roles to `ETHEREUM_DEPLOYER_ADDRESS`. | Run Safe ownership verification against live Sepolia contracts. Store non-secret Safe address, owner count, threshold, and role inventory in deployment metadata. Transfer/renounce deployer roles where appropriate. Add a gate that fails if deployer remains owner/admin outside test-only roles. |
| QCB-005 | Medium | Bridge guardian metadata | Qubitor deployment metadata is inconsistent about guardian mode. Live relayer reports `threshold`, while `contracts/deployments/testnet/bridge-deployments.json` records `guardianMode: "devnet_single"`. | Operators and auditors cannot rely on one artifact as source of truth. A stale artifact can cause unsafe relayer/genesis assumptions or wrong public reporting. | Static deployment metadata records `guardianMode: "devnet_single"`; live relayer status reports `guardianMode: "threshold"`. | Update deployment metadata from on-chain reads after threshold guardian setup. Add a readiness check that compares metadata, relayer config, and on-chain verifier `guardianMode()`/`threshold()`. |
| QCB-006 | Medium | Network decentralization/readiness | Public nodes are live and synced, but each reports only one peer. This is acceptable for an early private/public testnet but not enough for mainnet resilience. | Low peer diversity increases isolation, liveness, and reorg risk. It also weakens external miner/operator readiness evidence. | Live `net_peerCount` returned `0x1` on both public RPCs, and `qubitor_getMiningStatus` reports `peerCount: "0x1"`. | Add more bootnodes/full nodes/miners, document operator setup, and run multi-day multi-miner/reorg/peer-disconnect tests before mainnet. |
| QCB-007 | Medium | Public ops hardening | The secondary host has public Docker listeners on 80/443, but host firewall status does not list explicit 80/443 allow rules. Docker's iptables behavior can bypass or diverge from UFW policy. | Firewall policy can become misleading. Operators may believe only SSH and P2P are exposed while Docker-published web ports remain reachable. | Read-only host check showed public listeners for 80/443 on the secondary host and UFW allowing only SSH and P2P. The endpoints are reachable over HTTPS. | Align UFW and Docker firewall policy. Either explicitly allow intended ports with documented rules or configure Docker/UFW integration so firewall status reflects real exposure. |
| QCB-008 | Medium | Public API behavior | Public explorer and health responses include internal filesystem paths and launch/snapshot path names. | Not a secret by itself, but it gives unnecessary operational detail to the public and increases attack reconnaissance value. | Explorer health responses include `/repo/...` genesis, node data, launch material, and snapshot paths. | Keep public health checks minimal. Move detailed launch material and snapshot metadata behind an authenticated/internal endpoint or operator-only script. |
| QCB-009 | Low | Build/release hygiene | Both audited repos have dirty worktrees. The audit therefore applies to an uncommitted local state, not a clean release commit. | External auditors and future operators may not be able to reproduce the exact audited state from Git alone. | `git status --short` showed modified, deleted, and untracked files in both repos. | Commit or intentionally discard/review changes before external audit. Tag the audited commit/artifact set. |
| QCB-010 | Low | Local developer environment | PNPM commands emit warnings because the local npm config references an unset `NPM_TOKEN`. | This does not affect chain security, but it adds noise to CI/evidence logs and can hide real warnings. | Every PNPM evidence command logged `Failed to replace env in config: ${NPM_TOKEN}`. | Move token config to CI secrets or set a non-expanding local npmrc for read-only/test commands. |
| QCB-011 | Low | Bridge contracts | Forge build emits timestamp-manipulation warnings across reward, bridge, deadline, and cooldown code. | Most are expected for deadline/cooldown logic, but production audit should confirm timestamp assumptions and miner manipulation tolerances. | `pnpm build` in `qubitor-bridge` logs `block-timestamp` warnings in `ETHRewardDistributor`, `QubitorNativeBridgeVault`, `SepoliaQBTBridgeDepositAdapter`, `BridgeMessageRegistry`, and `QBTBridgeLiquidityVault`. | Document tolerances. Add tests around boundary times. External audit should review these paths. |

## Mainnet Blockers

Qubitor should not be declared mainnet-ready until all of these are true:

1. Public RPC privileged namespace exposure is fixed and tested.
2. Bridge API has reliable Sepolia RPC failover and no live-read 400s on core routes.
3. Bridge mainnet gate passes.
4. A new bridge soak artifact proves at least 20 successful runs with zero failures.
5. Sepolia bridge Safe/multisig/timelock ownership is verified live and recorded in deployment metadata.
6. Qubitor bridge guardian metadata matches on-chain threshold mode and relayer mode.
7. Public health endpoints are split into minimal public health and internal operational detail.
8. More public peers/miners/bootnodes are operated and soak-tested over multiple days.
9. All critical/high findings receive implementation fixes and retests.
10. External audits cover consensus, PQ precompile, Qubitor Account contracts, bridge contracts, relayer/backend, and genesis/system installer.

## Live Read-Only Checks

| Check | Result |
| --- | --- |
| Primary RPC `eth_chainId` | Pass: `0x164ca` |
| Secondary RPC `eth_chainId` | Pass: `0x164ca` |
| Primary/secondary genesis hash | Pass: both `0x8c422f1572daf17ff4b699c98db0b1d72a71bf9ef0f8cb926b1a15b4a3f33483` |
| Primary/secondary height divergence | Pass at sample time: both `107052`, later remote monitor both `107058` |
| Primary/secondary syncing | Pass: `false` |
| Primary/secondary peer count | Warning: both `1` |
| Required Qubitor account system contracts | Pass: non-empty code at `0x...0201`, `0x...0202`, `0x...0203` |
| Required Qubitor bridge system contracts | Pass: non-empty code at `0x...0301`, `0x...0302`, `0x...0303` |
| ML-DSA precompile address | Info: `eth_getCode` returns `0x`, expected for native precompile; security status and tests identify it |
| Public faucet status | Pass: PQ Native signer mode, non-devnet compatibility flag false |
| Public PQ submitter status | Pass: type `0x04`, wallet-owned ML-DSA signing, no legacy gas payer |
| Public admin RPC exposure | Fail: `admin_nodeInfo` succeeds |
| Public debug RPC exposure | Fail: `debug_verbosity` succeeds |
| Bridge API health | Pass: `/health` returns ok with Postgres/Redis configured |
| Bridge status | Pass: online, finality settings present, no wQBT |
| Bridge liquidity/fees | Fail: live routes return provider quota errors |
| Bridge relayer status | Mixed: up, execute mode, threshold, watchers enabled, 0 pending/failed, but 2 refundable messages |
| Bridge monitor/finalizer | Degraded due Sepolia RPC quota |
| Snapshots | Pass: recent daily snapshots listed on both nodes |
| Height monitor | Pass: both nodes reported same head and latest hash |
| Host disk | Pass: no disk pressure observed |
| DB/Redis exposure | Pass in read-only host check: Postgres/Redis bind to localhost |

## Static Evidence Highlights

### QubitorNetwork

- `services/rpc-gateway/src/index.ts` handles Qubitor methods and forwards all other JSON-RPC methods upstream. There is no public method allowlist.
- `contracts/deployments/testnet/deployments.json` records Qubitor system contracts and bridge contracts installed at genesis.
- `clients/qubitor-node/config/testnet/genesis.json` includes account/bridge system contract bytecode in genesis allocation for `0x...0201`, `0x...0202`, `0x...0203`, `0x...0301`, `0x...0302`, and `0x...0303`.
- `docs/security/threat-model.md`, `docs/quantum-readiness/coverage-matrix.md`, and `docs/security/admin-control-inventory.md` define the intended claim boundary and no-EOA native admin posture.

### qubitor-bridge

- `deployments/sepolia.json` records the latest Sepolia suite contract addresses and deployer address, but not verified Safe ownership.
- `services/README.md` documents threshold guardian mode and says `pnpm bridge:mainnet:gate` is expected to fail on early testnet unless ownership, soak, and live status gates pass.
- `scripts/readiness/mainnet-gate.ts` enforces threshold guardian mode, Safe owner checks, and soak requirements.
- Relayer/backend tests pass locally, and remote relayer status reports Postgres/Redis, execute mode, both directions, threshold guardian mode, and reorg handling.
- Sepolia RPC quota exhaustion currently breaks live bridge reads and monitor/finalizer checks.

## Claim-Boundary Appendix

Claim under review:

> Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts.

Current evidence supports this claim for **default Qubitor Account funds** on Qubitor testnet:

- Qubitor network security status reports `defaultSecurityMode: "PQ Native"`, `pqRequired: true`, and `ecdsaControl: false`.
- Qubitor Account contract tests passed:
  - PQ execution transfers value.
  - invalid PQ signatures are rejected.
  - replay is rejected.
  - key rotation requires current PQ authorization.
  - legacy EOA control paths are absent/fail.
- PQ native acceptance passed.
- Faucet and PQ submitter report wallet-owned ML-DSA transaction submission and no legacy gas payer.

Current evidence partially supports the claim for **Qubitor-native protocol/admin accounts**:

- Qubitor-native bridge/account system contracts are installed at genesis.
- Qubitor network security status reports bridge admin and bridge guardian as Qubitor control addresses.
- Local Qubitor tests include PQ-controlled admin vault behavior and EOA failure cases.

Current evidence does **not** fully support the broad claim for all bridge/protocol control surfaces:

- Sepolia bridge admin ownership is not proven by live Safe/multisig verification in this audit.
- Sepolia deployment scripts and relayer/finalizer fallbacks still reference ECDSA private-key variables for deployment/testnet execution.
- The bridge is cross-chain; Ethereum/Sepolia-side controls cannot be made PQ-native by Qubitor alone until governance/signing arrangements are explicitly migrated or mitigated.

Recommended public wording until blockers are fixed:

> Breaking ECDSA/secp256k1 alone cannot move funds from default Qubitor Accounts on Qubitor. Protocol/admin controls meet this boundary only where they are assigned to Qubitor Accounts or an explicitly documented PQ/hybrid policy. Ethereum/Sepolia bridge controls remain subject to their configured multisig/guardian model.

## Evidence Appendix

Evidence root: `/tmp/qubitor-audit-2026-06-09`

### Repository Context

QubitorNetwork:
- HEAD: `2da1fbdc5fe9beb8c766453474b045f0e1beb839`
- Worktree: dirty at audit time.

qubitor-bridge:
- HEAD: `25431bf915f68e01a34b6434d278d4302b4675c0`
- Worktree: dirty at audit time.

### QubitorNetwork Local Commands

| Command | Status | Log |
| --- | ---: | --- |
| `pnpm build` | 0 | `/tmp/qubitor-audit-2026-06-09/QubitorNetwork/build.log` |
| `pnpm typecheck` | 0 | `/tmp/qubitor-audit-2026-06-09/QubitorNetwork/typecheck.log` |
| `pnpm testnet:readiness` | 0 | `/tmp/qubitor-audit-2026-06-09/QubitorNetwork/testnet-readiness.log` |
| `pnpm testnet:bridge-genesis:verify` | 0 | `/tmp/qubitor-audit-2026-06-09/QubitorNetwork/bridge-genesis-verify.log` |
| `pnpm pq-native:acceptance` | 0 | `/tmp/qubitor-audit-2026-06-09/QubitorNetwork/pq-native-acceptance.log` |
| `pnpm coregeth:test` | 0 | `/tmp/qubitor-audit-2026-06-09/QubitorNetwork/coregeth-test.log` |
| `pnpm contracts:test` | 0 | `/tmp/qubitor-audit-2026-06-09/QubitorNetwork/contracts-test.log` |
| `pnpm test` | 0 | `/tmp/qubitor-audit-2026-06-09/QubitorNetwork/full-test.log` |

Notable QubitorNetwork test output:
- CoreGeth package tests passed for `core/types`, `core`, `core/vm`, `internal/ethapi`, and `params/types/coregeth`.
- Qubitor Account Foundry tests: 9 passed, 0 failed.

### qubitor-bridge Local Commands

| Command | Status | Log |
| --- | ---: | --- |
| `pnpm build` | 0 | `/tmp/qubitor-audit-2026-06-09/qubitor-bridge/build.log` |
| `pnpm typecheck` | 0 | `/tmp/qubitor-audit-2026-06-09/qubitor-bridge/typecheck.log` |
| `pnpm test` | 0 | `/tmp/qubitor-audit-2026-06-09/qubitor-bridge/test.log` |
| `pnpm bridge:readiness:testnet` | 1 | `/tmp/qubitor-audit-2026-06-09/qubitor-bridge/bridge-readiness-testnet.log` |
| `pnpm bridge:mainnet:gate` | 1 | `/tmp/qubitor-audit-2026-06-09/qubitor-bridge/bridge-mainnet-gate.log` |

Notable qubitor-bridge test output:
- Package tests passed for bridge config, bridge backend, bridge indexer, bridge relayer, bridge monitor, epoch finalizer, Qubitor PQ tx package, and web smoke tests.
- Foundry bridge tests: 21 passed, 0 failed.
- Build succeeded with Forge timestamp warnings.

### Live Read-Only Commands

| Check | Status | Log |
| --- | ---: | --- |
| Public endpoint/RPC JSON summary | 0 | `/tmp/qubitor-audit-2026-06-09/live/live-summary.json` |
| Public endpoint raw responses | 0 | `/tmp/qubitor-audit-2026-06-09/live/live-checks.json` |
| DNS resolution | 0 | `/tmp/qubitor-audit-2026-06-09/live/dns-and-ports.log` |
| Secondary RPC status | 0 | `/tmp/qubitor-audit-2026-06-09/live/secondary-rpc-status.log` |
| Snapshot status | 0 | `/tmp/qubitor-audit-2026-06-09/live/snapshot-status-all.log` |
| Height monitor status | 0 | `/tmp/qubitor-audit-2026-06-09/live/height-monitor-status-all.log` |
| Bridge relayer status | 0 | `/tmp/qubitor-audit-2026-06-09/live/relayer-testnet-status.log` |
| Host read-only ops status | 0 | `/tmp/qubitor-audit-2026-06-09/live/server-readonly-ops.log` |

Live checks were read-only. SSH was used only for status/log/disk/firewall/process inspection.

## Follow-Up Implementation Queue

1. Add RPC method allowlist and deny privileged namespaces on public gateway.
2. Add tests proving public gateway rejects admin/debug/personal/miner/txpool methods.
3. Rotate Sepolia RPC to a non-exhausted endpoint and add failover.
4. Change bridge API live-read failures to cached degraded responses where safe.
5. Verify Sepolia Safe ownership and write non-secret admin metadata to deployments.
6. Remove deployer EOA roles or record explicit test-only exceptions.
7. Reconcile Qubitor bridge guardian metadata against live on-chain threshold reads.
8. Re-run bridge readiness and mainnet gate.
9. Run fresh 20-run bridge soak with both directions.
10. Add public/internal health endpoint split.
11. Align secondary firewall policy with Docker-published public ports.
12. Commit/tag a clean audited state before external review.
