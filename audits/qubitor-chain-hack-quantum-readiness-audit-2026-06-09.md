# Qubitor Chain Hack + Quantum Readiness Audit

Date: 2026-06-09
Scope: QubitorNetwork chain surfaces plus the Qubitor bridge surfaces that affect chain safety.
Evidence directory: `/tmp/qubitor-hack-audit-2026-06-09/`

## Hard Rule

No live chain deletion, reset, rewrite, genesis replacement, or node-data wipe was performed.

Live checks were read-only. Active destructive simulations were not pointed at the live testnet.

## Reference Baselines

- [OWASP Smart Contract Top 10](https://owasp.org/www-project-smart-contract-top-10/)
- [OWASP Smart Contract Security Testing Guide](https://scs.owasp.org/SCSTG/)
- [MITRE AADAPT crypto threat framework](https://www.mitre.org/news-insights/news-release/mitre-introduces-aadapt-cybersecurity-framework-cryptocurrency)
- [NIST FIPS 204: ML-DSA](https://csrc.nist.gov/pubs/fips/204/final)
- [NIST FIPS 205: SLH-DSA](https://csrc.nist.gov/pubs/fips/205/final)

## Executive Summary

Mainnet readiness posture: **fail**, with two remaining red launch blockers in the current dashboard.

The Qubitor testnet is live, both public RPC endpoints are on the same chain, system bridge/account contracts are present, CoreGeth/PQ/account contract tests pass, the bridge backend is running with execute-mode relayer, watchers, Postgres, Redis, threshold guardian mode, and no wrapped-QBT model, and current public peer/miner diversity evidence is green.

Closed since the original audit:

1. Public RPC privileged namespaces are blocked by the gateway.
2. Bridge soak/readiness/mainnet gate pass with the latest 20-run testnet soak.
3. Current public peer/miner diversity evidence is green across the primary and secondary RPCs.
4. Public health surfaces are sanitized.
5. Normal readiness docs no longer include reset commands.

Remaining mainnet launch blockers:

1. Sepolia-side bridge/admin control still needs verified multisig/timelock owner evidence.
2. External audits remain required for CoreGeth changes, ML-DSA precompile, Qubitor Accounts, bridge contracts, and bridge relayer.
3. Production mining still needs broader independent operators beyond the current internal testnet diversity evidence.

The exact quantum claim is partially supported for default Qubitor Accounts:

> Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds.

That claim is **not** enough to describe the whole network as impossible to compromise or permanently safe against every future quantum attack. Consensus, bridge operations, Sepolia-side contracts, DNS/TLS, servers, and any legacy EOA compatibility path remain outside that narrow account-control claim.

## Hardening Addendum: 2026-06-10

Post-audit hardening was completed without live chain deletion, reset, rewrite, genesis replacement, or node-data wipe. The live rollout restarted only affected public services after local checks passed.

Commands and outcomes:

| Command / Check | Result | Notes |
| --- | ---: | --- |
| `pnpm testnet:ops-code:deploy-rpc-hardening` | pass | No-reset deploy to primary and secondary; restarted only `rpc-gateway` and `public-gateway`. |
| Explorer public-health no-reset deploy | pass | Restarted only `explorer-lite`; public explorer health no longer exposes internal paths or launch material. |
| `BRIDGE_SOAK_RUNS=20 BRIDGE_SOAK_FAIL_FAST=1 BRIDGE_SOAK_RESTART_DURING_FINALITY=0 BRIDGE_SOAK_RESTART_AFTER_EXECUTED=0 pnpm bridge:soak:testnet` | pass | 20/20 successful runs, 0 failures, 20 distinct amounts, both bridge directions executed each run. |
| `pnpm bridge:readiness:testnet` | pass | Bridge API, relayer, monitor, finalizer, liquidity, and soak artifact all passed. |
| `pnpm bridge:mainnet:gate` | pass | Execute-mode relayer, watchers enabled, threshold guardian mode, 32 Sepolia confirmations, 50 Qubitor confirmations, zero failed/reorged/stuck messages. |
| `pnpm mainnet:security-gate` | pass | QubitorNetwork build/typecheck/test/CoreGeth/contracts/PQ acceptance, bridge build/typecheck/test/contracts, live RPC probes, system-contract checks, metrics exposure checks, and bridge gate all passed. |

Fresh evidence from the hardening sprint:

- Primary and secondary public RPCs now reject `admin_*`, `debug_*`, `personal_*`, `miner_*`, `txpool_*`, and `engine_*` before upstream forwarding.
- Batch requests cannot bypass the RPC allowlist.
- Public RPC health returns only `{ ok, network, chainId }`.
- Public `/metrics` on RPC hostnames is not exposed.
- Public explorer health returns only public chain metadata.
- `qubitor_sendRawPQTransaction` is allowed as a public signed PQ transaction submission method, matching the role of `eth_sendRawTransaction`; invalid raw input reaches CoreGeth and fails there instead of being blocked by the gateway.
- The bridge soak artifact is `qubitor-bridge/artifacts/testnet/bridge-soak/bridge-soak-2026-06-09T16-51-18-363Z.json`.
- Bridge monitor after soak reported pending `0`, failed `0`, reorged `0`, stuck `0`, and no active alerts.
- A disposable local reorg/idempotency evidence harness now covers duplicate observation, `WaitingFinality` recovery, `Submitted` recovery, and reorged-source no-release behavior.
- Normal readiness docs no longer carry reset commands; destructive chain actions are moved to emergency-only break-glass documentation.

Updated blocker status:

| ID | Status After Hardening | Evidence |
| --- | --- | --- |
| C-01 | Closed for public RPC gateway exposure. | `pnpm mainnet:security-gate`; live primary/secondary privileged namespace probes. |
| H-01 | Closed for testnet bridge readiness soak. | 20/20 soak artifact, `pnpm bridge:readiness:testnet`, `pnpm bridge:mainnet:gate`. |
| H-04 | Closed for current readiness evidence. | Disposable reorg/idempotency harness and restart evidence from bridge canary/soak tooling. |
| M-01 | Closed for body, batch, params, parse-error, and privileged-method controls. | `@qubitor/rpc-gateway` tests and live RPC probes. |
| M-02 | Closed for RPC and explorer public health surfaces. | `pnpm mainnet:security-gate`; primary/secondary `/health` probes. |
| M-03 | Closed for normal readiness docs. | `pnpm testnet:readiness`; `pnpm testnet:deploy-safety`; emergency-only break-glass doc. |
| M-05 | Reclassified. | Metrics are intentionally private/operator-only; public metrics endpoints are not exposed. |

Remaining mainnet launch conditions:

- H-02 is closed for current internal testnet evidence; production should still recruit and document independent miner operators before mainnet launch.
- Sepolia bridge owner/threshold evidence remains incomplete until `SEPOLIA_SAFE_OWNER_ADDRESSES` or equivalent production ownership proof is configured and verified.
- Firewall/Docker exposure policy should still be documented and aligned across hosts.
- Refund queue policy and user-visible refund handling still need launch-grade runbooks/UI.
- External audits remain required for CoreGeth changes, ML-DSA precompile, Qubitor Accounts, bridge contracts, and bridge relayer.

## Hardening Addendum: 2026-06-11

Additional safe hardening was added without live chain deletion, reset, rewrite, genesis replacement, or node-data wipe.

New evidence and guardrails:

| Area | Result | Evidence |
| --- | ---: | --- |
| ML-DSA precompile edge cases | Added and passing | `go test ./clients/qubitor-node/precompile/mldsa65` now covers malformed public keys, malformed signatures, wrong message/domain, malformed ABI offsets/lengths, large message/context input, fuzz seed behavior, and a benchmark entry point. |
| Auxiliary miner/full node | Deployed without reset | `pnpm testnet:aux-miner:deploy secondary` started a separate node on bootnode 2 using `data/node/testnet-aux-miner-aux-miner-1`, separate P2P port `30313`, and reward address `0x6C0f8AB07f1F08429fE9e08b51E8099b73458125`. It never mounted or touched `data/node/testnet`. |
| Auxiliary miner live sealing | Passing | Aux miner logs show `Successfully sealed new block` for live blocks `118973` through `118976`; public RPC samples include miner `0x6c0f8ab07f1f08429fe9e08b51e8099b73458125`. |
| Peer/miner diversity snapshot | Added and current live result green | `QUBITOR_PEER_DIVERSITY_SAMPLE_BLOCKS=80 pnpm testnet:peer-diversity:check` samples public RPCs and recent block miners. Current live evidence shows primary and secondary RPCs at peer count `2+` and two recent miners across the sample window. |
| Mainnet readiness dashboard | Added; current status red | `pnpm mainnet:readiness-dashboard` writes `audits/mainnet-readiness-dashboard-2026-06-11.md`. |
| Firewall/public surface docs | Added | `docs/testnet/firewall-and-public-surface.md` documents intended public ports, blocked RPC namespaces, metrics privacy, and no-reset service deploys. |
| Bridge refund runbook | Added | `qubitor-bridge/docs/refund-runbook.md` documents refundable/stuck message triage, refund criteria, operator response, and user-safe support language. |
| Readiness guard | Updated and passing | `pnpm testnet:readiness` now requires the peer/miner diversity script, dashboard script, and public-surface doc. |

Current dashboard result:

- Public RPC: green.
- Bridge API: green.
- Bridge soak: green.
- Refund operations: green.
- Firewall/public surface docs: green.
- Peer and miner diversity: green, because both public RPCs report peer count `2+` and aggregate recent miner count `2`.
- Sepolia ownership proof: red, because fewer than 3 Safe owners are configured locally for verification.
- External audits: red, because external audits are still required before mainnet launch.

This means the chain is materially harder and better-instrumented than the original audit state, but Qubitor is still not honest-to-goodness mainnet launch-ready until Sepolia ownership proof and external audit conditions are closed. Production mining should still expand beyond the current internal testnet miners before mainnet launch.

## Evidence Summary

QubitorNetwork gates:

| Command | Result | Evidence |
| --- | ---: | --- |
| `pnpm build` | pass | `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_build.log` |
| `pnpm typecheck` | pass | `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_typecheck.log` |
| `pnpm test` | pass | `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_test.log` |
| `pnpm coregeth:test` | pass | `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_coregeth_test.log` |
| `pnpm contracts:test` | pass | `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_contracts_test.log` |
| `pnpm pq-native:acceptance` | pass | `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_pq-native_acceptance.log` |
| `pnpm testnet:readiness` | pass | `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_testnet_readiness.log` |
| `pnpm testnet:deploy-safety` | pass | `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_testnet_deploy-safety.log` |
| `pnpm testnet:bridge-genesis:verify` | pass | `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_testnet_bridge-genesis_verify.log` |

Bridge gates:

| Command | Result | Evidence |
| --- | ---: | --- |
| `pnpm build` | pass | `/tmp/qubitor-hack-audit-2026-06-09/qubitor-bridge/pnpm_build.log` |
| `pnpm typecheck` | pass | `/tmp/qubitor-hack-audit-2026-06-09/qubitor-bridge/pnpm_typecheck.log` |
| `pnpm test` | pass | `/tmp/qubitor-hack-audit-2026-06-09/qubitor-bridge/pnpm_test.log` |
| `pnpm contracts:test` | pass | `/tmp/qubitor-hack-audit-2026-06-09/qubitor-bridge/pnpm_contracts_test.log` |
| `pnpm bridge:readiness:testnet` | fail | `/tmp/qubitor-hack-audit-2026-06-09/qubitor-bridge/pnpm_bridge_readiness_testnet.log` |
| `pnpm bridge:mainnet:gate` | fail | `/tmp/qubitor-hack-audit-2026-06-09/qubitor-bridge/pnpm_bridge_mainnet_gate.log` |

Live read-only checks:

- Primary and secondary public RPCs return chain ID `91338`.
- Primary and secondary public RPCs reported the same genesis hash and matching head during this audit.
- Primary and secondary system contracts at `0x...0201`, `0x...0202`, `0x...0203`, `0x...0301`, `0x...0302`, and `0x...0303` have non-empty code.
- ML-DSA precompile address `0x...0100` returns empty code, which is normal for a native precompile; behavior is covered by local CoreGeth tests.
- Public RPC, faucet, PQ submitter, explorer, bridge health, bridge status, bridge liquidity, bridge fees, and bridge config endpoints responded.
- `https://api.0xq.app/metrics` returned `404`.
- Relayer status reports execute mode, watchers enabled, threshold guardian mode, Postgres/Redis active, pending 0, failed 0, reorged 0, and refundable 2.
- Server read-only checks found UFW active and disk usage low on both nodes.

Live evidence files:

- `/tmp/qubitor-hack-audit-2026-06-09/live/public-rpc-and-endpoints.json`
- `/tmp/qubitor-hack-audit-2026-06-09/live/rpc-abuse-probes.json`
- `/tmp/qubitor-hack-audit-2026-06-09/live/dns.log`
- `/tmp/qubitor-hack-audit-2026-06-09/live/qubitornetwork-readonly-status.log`
- `/tmp/qubitor-hack-audit-2026-06-09/live/qubitor-bridge-relayer-status.log`
- `/tmp/qubitor-hack-audit-2026-06-09/live/server-readonly-ops.log`

## Findings

| ID | Severity | Component | Finding | Impact | Evidence | Required Fix |
| --- | --- | --- | --- | --- | --- | --- |
| C-01 | Critical | Public RPC gateway | Public RPC forwards privileged namespaces including `admin_nodeInfo`, `debug_verbosity`, `miner_start`, and `txpool_status`. Batch requests can include privileged calls. | Public clients can reach methods that should never be exposed on a production RPC. Even when a method is not directly destructive, it leaks node internals and widens the attack surface. | `live/public-rpc-and-endpoints.json`, `live/rpc-abuse-probes.json`; gateway forwarding code in `services/rpc-gateway/src/index.ts:348`. | Add a strict public RPC allowlist and reject `admin_*`, `debug_*`, `personal_*`, `miner_*`, `txpool_*`, `engine_*`; enforce it for single and batch calls before upstream forwarding. |
| H-01 | High | Bridge readiness | Bridge readiness and mainnet gates fail because the latest soak artifact did not satisfy the required zero-failure soak. The failed run reverted during `bridgeToQubitor`. | Bridge cannot be treated as production-ready. A failed bridge-in path is a direct stuck-funds risk. | `qubitor-bridge/pnpm_bridge_readiness_testnet.log`, `qubitor-bridge/pnpm_bridge_mainnet_gate.log`. | Decode the revert, fix the failing path, then run 20+ clean bridge soaks in both directions with varied amounts and recipients. |
| H-02 | High | Majority-hash risk | Original audit lacked miner/hash diversity evidence. Current 2026-06-11 internal testnet evidence is green with two recent miners and peer count `2+` across public RPCs, but production still needs broader independent miners and published monitoring. | A low-diversity PoW network remains exposed to majority-hash reorgs, double-spend attempts, censorship, and bridge-finality abuse. | `audits/mainnet-readiness-dashboard-2026-06-11.md`; `QUBITOR_PEER_DIVERSITY_SAMPLE_BLOCKS=80 pnpm testnet:peer-diversity:check`; aux miner sealed blocks `118973` through `118976`. | Recruit independent miners, publish miner docs, track peer/hash diversity, add reorg alarms, and set bridge finality from observed hash distribution. |
| H-03 | High | Bridge admin/control | Sepolia-side bridge safety still depends on Sepolia/ECDSA infrastructure and ownership evidence is incomplete. Mainnet gate warns that safe-owner verification is not configured locally. | A compromised ECDSA owner/admin path can affect bridge liquidity and release controls even if Qubitor accounts are PQ-native. | `qubitor-bridge/pnpm_bridge_mainnet_gate.log`; static grep evidence for Sepolia private-key/admin scripts. | Transfer production admin to audited multisig/timelock, publish owner/threshold evidence, and gate deployment on verified owner sets. |
| H-04 | High | Reorg/idempotency evidence | Code and service status claim reorg/idempotency handling, but this audit did not produce a current passing local reorg simulation or restart-during-finality run. | Bridge double-release and stuck-message risks are not fully closed without recent scenario evidence. | Requested scenario is absent from current passing gates; bridge soak failed. | Add disposable local simulation harnesses for reorg, restart, duplicate observation, and submitted-state recovery; make them part of readiness. |
| M-01 | Medium | RPC abuse controls | Public RPC uses wildcard CORS, accepts JSON-RPC batches, returns HTTP 200 for malformed JSON, and a 20-request burst did not hit rate limiting. | This is not by itself a chain break, but it makes public RPC abuse and client-side misuse easier. | `live/rpc-abuse-probes.json`; `services/rpc-gateway/src/index.ts:360`. | Add body-size limits, batch limits, method-level rate limits, normalized errors, and a stricter CORS policy for browser-facing domains. |
| M-02 | Medium | Public health surfaces | Public health responses expose upstream/internal service names and some operational status surfaces expose launch-material and snapshot paths. | Operational detail can help attackers map the stack. | `services/rpc-gateway/src/index.ts:376`; `live/qubitornetwork-readonly-status.log`. | Split public health from operator diagnostics. Public health should return only service status, chain ID, and safe version metadata. |
| M-03 | Medium | Reset/destructive tooling | Testnet reset tooling remains documented and available. It has guards, but it conflicts with the new operating rule: never delete, reset, rewrite, replace genesis, or wipe node data. | Human-error risk remains high because a guarded command still exists in the documented path. | `docs/testnet/readiness.md:96`. | Move reset docs to an archived emergency-only page, require a separate break-glass repo/process, and remove reset commands from normal readiness docs. |
| M-04 | Medium | Firewall/container exposure | Primary firewall policy matches public ports. Secondary UFW rules do not list HTTP/HTTPS, while Docker publishes HTTP/HTTPS. | Docker-published ports can bypass operator expectations if firewall and Docker policy are not aligned. | `live/server-readonly-ops.log`. | Align UFW, Docker, and reverse-proxy policy on both hosts; document intentional public ports. |
| M-05 | Medium | Bridge observability | Bridge monitor metrics exist through service status, but public `https://api.0xq.app/metrics` returned 404. | Operators and status pages need a stable metrics path. Missing public or private metrics routing reduces incident response quality. | `live/public-rpc-and-endpoints.json`, `live/qubitor-bridge-relayer-status.log`. | Expose metrics on a protected/private route or wire the intended public status-safe metrics endpoint. |
| M-06 | Medium | Refund queue | Relayer reports 2 refundable messages. | Refundable messages can be expected in tests, but unexplained refundable state is a bridge support and accounting risk. | `live/qubitor-bridge-relayer-status.log`. | Add a refund-queue runbook, user-visible refund UI, and readiness policy for maximum refundable age/count. |
| L-01 | Low | Local developer environment | Commands emit an npm config warning for unresolved `${NPM_TOKEN}`. | This does not affect chain consensus, but it pollutes logs and can hide real warnings. | All command logs. | Clean local `.npmrc` or export the token only in publish shells. |
| L-02 | Low | Repo hygiene | Both audited repos had dirty worktrees during the audit. | Dirty state weakens reproducibility and external audit handoff. | `static/git-context.log`. | Commit or explicitly inventory dirty changes before external audit. |
| L-03 | Low | Documentation freshness | Some hardening/readiness docs still contain stale launch-era language and operational details that no longer match the current no-reset policy. | Stale docs can cause wrong operator actions. | `static/qubitor-network-attack-surface-rg.log`, `docs/testnet/readiness.md`. | Update docs around current live-state policy, DNS state, and no-reset operations. |
| I-01 | Info | Qubitor account security | Qubitor account tests cover PQ execution, invalid signature rejection, replay rejection, key rotation authorization, and absence of legacy owner controls. | Supports the narrow account-control quantum claim. | `QubitorNetwork/pnpm_contracts_test.log`. | Keep these tests mandatory and add fuzz/vector coverage. |
| I-02 | Info | Bridge contract security | Bridge contract tests cover message vectors, duplicate message rejection, wrong chain/asset rejection, pause behavior, refunds, liquidity accounting, and guardian-attested releases. | Good contract-level baseline, but not a substitute for live soak and external audit. | `qubitor-bridge/pnpm_contracts_test.log`. | Extend with invariants and live testnet scenario gates. |
| I-03 | Info | System contract presence | Live RPC shows account and bridge system addresses have code on primary and secondary. | Confirms genesis/system install state for those contracts. | `live/public-rpc-and-endpoints.json`. | Keep this in readiness and height-monitor checks. |

## Attack-Class Matrix

| Attack Type | Current Mitigation | Evidence | Residual Risk | Mainnet Fix Required |
| --- | --- | --- | --- | --- |
| 51% / majority-hash double spend | PoW finality delay, two public nodes, bridge confirmation settings, and current two-miner testnet evidence. | RPC heights match; relayer finality 32 Sepolia / 50 Qubitor; dashboard shows two recent miners. | Medium on current testnet evidence; high for mainnet until independent public miners and hashrate monitoring are in place. | Add independent miners, publish hashrate/peer metrics, and tune bridge finality from observed reorg risk. |
| Selfish mining / timestamp manipulation | CoreGeth consensus tests pass. | `pnpm coregeth:test` passed. | No current multi-miner selfish-mining simulation evidence. | Add local simulations and long-running multi-miner soak. |
| Invalid block / invalid difficulty acceptance | Core tests pass for consensus packages. | `pnpm coregeth:test` passed. | Need broader fuzz/invariant coverage before mainnet. | Add invalid-header/difficulty fuzz tests and CI gates. |
| Reorg handling across services | Relayer status says finalized logs are rechecked; height monitor records chain head. | Relayer status and height monitor logs. | No current passing reorg simulation in this audit. | Add disposable reorg tests for RPC, explorer, indexer, wallet API, and bridge. |
| Eclipse / peer isolation | Bootnodes resolve, both RPCs are synced, and current public RPC peer counts meet the readiness threshold. | Dashboard and peer/miner diversity check. | Bootnode dependency remains and mainnet needs more externally operated peers. | Add more bootnodes and external peers; alert on low peer count. |
| Privileged RPC exposure | None sufficient. | Public probes show privileged methods are exposed. | Critical. | Strict RPC method allowlist. |
| JSON-RPC DoS / batch abuse | Basic gateway and Caddy are present. | Batch works; no small-burst rate limit hit. | Medium. | Body-size, batch-size, method-rate, and request-rate limits. |
| Legacy EOA transaction path | CoreGeth guard rejects legacy tx types when `QUBITOR_EOA_TXS=0`. | Code grep and QubitorNetwork tests. | Need live negative transaction evidence in every readiness run. | Add a live read-only-safe negative raw-tx check or a signed local-only fixture test. |
| PQ transaction replay | Qubitor Account replay test passes. | `testReplayRejected()` passed. | Needs more malformed/fuzz vectors. | Add chain ID/domain/nonce fuzzing. |
| Malformed ML-DSA signature/key/context | Invalid signature tests and CoreGeth VM tests pass. | `pnpm coregeth:test`, `pnpm contracts:test`. | Need gas-bound and max-input fuzzing. | Add precompile fuzz and gas benchmark gates. |
| EVM access control | Tests cover no legacy owner function and PQ admin vault control. | Qubitor contract tests. | External audit still required. | Invariants and external audit. |
| Reentrancy / unchecked calls / arithmetic | Bridge tests cover major liquidity and reward accounting cases. | Bridge contract tests. | Needs invariant fuzz for full OWASP coverage. | Foundry invariant suite and external review. |
| Bridge fake message / replay / wrong chain | Contract tests reject duplicates, wrong chain/asset, and invalid guardian. | Bridge contract tests. | Live soak still failed. | Fix live bridge path and run 20+ clean soaks. |
| Guardian threshold bypass | Threshold mode is reported live; tests cover guardian-attested release. | Relayer status and contract tests. | Sepolia/admin ownership evidence incomplete. | Verify owner sets and guardian rotations on-chain. |
| Relayer restart/idempotency | Status reports message-hash keyed jobs and Postgres/Redis. | Relayer status. | No current restart-during-finality evidence in audit. | Add restart/idempotency integration tests to readiness. |
| Low liquidity / cap bypass | Live liquidity and caps reported; no failed/reorged messages. | Bridge liquidity/status logs. | Refundable messages exist; low-liquidity behavior needs live drill. | Run low-liquidity and refund drills on testnet. |
| Sepolia dependency | Sepolia confirmation window and liquidity vault in use. | Bridge status. | ECDSA/Sepolia risk is outside Qubitor PQ account guarantees. | Publish separate Sepolia risk boundary and admin controls. |
| Quantum attack on ECDSA | Default Qubitor Accounts use ML-DSA control; ECDSA alone should not move default account funds. | Qubitor account tests and PQ status. | Does not cover legacy EOAs, Sepolia contracts, TLS/DNS, or PoW economics. | Keep claims narrow and make admin ownership PQ-native where Qubitor controls exist. |
| Quantum attack on hash mining | PoW mining is still a hashpower race. | Architecture review. | A powerful adversary can still attack consensus through majority work. | Do not market PoW consensus as quantum-proof; model quantum mining economics separately. |

## Quantum-Readiness Appendix

### PQ-Native Today

- Qubitor Account contract tests show ML-DSA-authorized execution, replay rejection, key rotation authorization, and no legacy owner function.
- Qubitor CoreGeth tests pass for the PQ transaction and ML-DSA precompile package surfaces covered by the current suite.
- Live faucet/PQ status reports QubitorPQTxV1 signing/submission flow and ML-DSA account-control messaging.
- Live system account/bridge contract addresses exist on both public RPCs.
- `QUBITOR_EOA_TXS=0` is present in launch/readiness policy and code rejects legacy transaction types when the flag is active.

### Not Fully PQ-Covered

- Sepolia-side contracts, Sepolia transaction submission, and Ethereum/Sepolia admin controls remain ECDSA-chain dependent unless placed behind a verified multisig/timelock and separately governed.
- Public RPC, DNS, TLS, server SSH, Cloudflare, Docker hosts, and CI are not made quantum-resistant by ML-DSA account control.
- PoW consensus is not immune to a well-funded or quantum-accelerated majority-work attacker.
- Any user who stores funds in a legacy EOA is outside the default Qubitor Account claim.
- Protocol/admin controls are covered only when they are actually assigned to Qubitor Accounts or stricter PQ policy.
- ML-DSA precompile and QubitorPQTxV1 still need external audit, fuzzing, gas-bound tests, and long-lived mainnet-style soak.

### Claim Boundary

Supported by current evidence:

> Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds.

Partially supported, but must be continuously verified:

> Breaking ECDSA/secp256k1 alone cannot control Qubitor-native protocol/admin accounts when those controls are assigned to Qubitor Accounts or stricter PQ policy.

Not supported:

- Absolute hack immunity.
- Permanent safety against every future quantum attack.
- End-to-end bridge quantum resistance across every dependency.
- Immunity from majority-work attacks against PoW consensus.

## Original Mainnet Blockers

The list below is the blocker list from the original 2026-06-09 audit pass. See the 2026-06-10 hardening addendum above for the updated status after RPC hardening, bridge soak, readiness, and `pnpm mainnet:security-gate`.

1. Lock down public RPC method allowlist and batch handling.
2. Fix the failed bridge soak path and pass 20+ clean bridge soaks both directions.
3. Produce current reorg, relayer restart, duplicate observation, and idempotency evidence.
4. Verify Sepolia bridge ownership/admin/guardian controls on-chain.
5. Add miner diversity, bootnode diversity, peer-count alarms, and majority-hash risk monitoring.
6. Remove reset tooling from normal operator docs and require a break-glass process for any future destructive action.
7. Split public health from operator diagnostics.
8. Add stable bridge metrics/status routing and alerting evidence.
9. Add ML-DSA precompile fuzz/gas/max-input tests.
10. Run external audits for CoreGeth changes, ML-DSA precompile, Qubitor Accounts, and bridge contracts/relayer.

## Evidence Appendix

Static evidence:

- `/tmp/qubitor-hack-audit-2026-06-09/static/git-context.log`
- `/tmp/qubitor-hack-audit-2026-06-09/static/qubitor-network-attack-surface-rg.log`
- `/tmp/qubitor-hack-audit-2026-06-09/static/qubitor-bridge-attack-surface-rg.log`
- `/tmp/qubitor-hack-audit-2026-06-09/static/key-qubitor-files.log`

QubitorNetwork evidence:

- `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/results.csv`
- `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_build.log`
- `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_typecheck.log`
- `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_test.log`
- `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_coregeth_test.log`
- `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_contracts_test.log`
- `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_pq-native_acceptance.log`
- `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_testnet_readiness.log`
- `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_testnet_deploy-safety.log`
- `/tmp/qubitor-hack-audit-2026-06-09/QubitorNetwork/pnpm_testnet_bridge-genesis_verify.log`

Bridge evidence:

- `/tmp/qubitor-hack-audit-2026-06-09/qubitor-bridge/results.csv`
- `/tmp/qubitor-hack-audit-2026-06-09/qubitor-bridge/pnpm_build.log`
- `/tmp/qubitor-hack-audit-2026-06-09/qubitor-bridge/pnpm_typecheck.log`
- `/tmp/qubitor-hack-audit-2026-06-09/qubitor-bridge/pnpm_test.log`
- `/tmp/qubitor-hack-audit-2026-06-09/qubitor-bridge/pnpm_contracts_test.log`
- `/tmp/qubitor-hack-audit-2026-06-09/qubitor-bridge/pnpm_bridge_readiness_testnet.log`
- `/tmp/qubitor-hack-audit-2026-06-09/qubitor-bridge/pnpm_bridge_mainnet_gate.log`

Live read-only evidence:

- `/tmp/qubitor-hack-audit-2026-06-09/live/public-rpc-and-endpoints.json`
- `/tmp/qubitor-hack-audit-2026-06-09/live/rpc-abuse-probes.json`
- `/tmp/qubitor-hack-audit-2026-06-09/live/dns.log`
- `/tmp/qubitor-hack-audit-2026-06-09/live/qubitornetwork-readonly-status.log`
- `/tmp/qubitor-hack-audit-2026-06-09/live/qubitor-bridge-relayer-status.log`
- `/tmp/qubitor-hack-audit-2026-06-09/live/server-readonly-ops.log`

## Notes For External Auditors

- This is an internal readiness audit, not a replacement for a professional external audit.
- Secrets were not copied into this report.
- Live checks were read-only.
- The most urgent security fix is public RPC method filtering.
- The most urgent bridge-readiness fix is the failed soak/reverted bridge-in path.
