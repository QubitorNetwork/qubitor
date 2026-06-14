# Qubitor Full Ecosystem Internal Audit Addendum

Date: 2026-06-14  
Mode: audit blocker closure pass, no live chain mutation  
Base report: `audits/qubitor-full-ecosystem-internal-audit-2026-06-14.md`

## Summary

This addendum records the fixes and verification run after the 2026-06-14 full ecosystem internal audit.

No live chain reset, rewrite, genesis replacement, node-data wipe, node restart, deployment, service restart, or migration was performed.

Launch recommendation remains: **candidate with blockers**.

The bridge readiness blocker is fixed, QubitScan address-route browser coverage is added and passing, bridge refundable messages are documented for operator disposition, and public/internal docs boundaries were tightened. External audit closure remains deferred until the actual report or attestation is attached. Release hygiene is improved by safety snapshots, but not fully closed until the dirty worktrees are split into focused PRs and merged into a clean release tag.

## Finding Status

| ID | Previous Severity | Status | Closure Evidence |
| --- | --- | --- | --- |
| QFA-001 | High | Partially addressed | Safety snapshots were written under `/tmp/qubitor-audit-blocker-fix-2026-06-14/` for `QubitorNetwork`, `qubitor-bridge`, `qubitor-docs`, and `qubitscan`. This preserves the mixed state before PR splitting. The blocker is not fully closed until focused branches are merged and a clean release tag is audited. |
| QFA-002 | High | Deferred | Added `audits/external-audit/README.md` with required closure fields. Dashboard/readiness wording now says external audit closure is deferred until the report or attestation is added. No mainnet-ready claim is made from this item. |
| QFA-003 | Medium | Closed | `qubitor-bridge` readiness now loads configured env files and uses configured Sepolia/Qubitor RPCs for live token binding checks. Localhost Sepolia RPC is allowed only with explicit local/dev opt-in. `pnpm bridge:readiness:testnet` passes. |
| QFA-004 | Medium | Documented, operationally bounded | Added `qubitor-bridge/docs/testnet-refundable-disposition-2026-06-14.md` listing the 4 stale Sepolia-to-Qubitor refundable testnet messages, source txs, message hashes, expiry reason, and operator decision. Failed/reorged/stuck remain zero. Mainnet launch policy remains zero unexplained refundable messages. |
| QFA-005 | Medium | Closed for regression coverage | QubitScan cursor DOM handling now guards missing refs. Browser E2E coverage was added for valid address, miner address, zero-activity address, and invalid address routes. `pnpm typecheck`, `pnpm build`, and `pnpm e2e:address` pass in `qubitscan`. |
| QFA-006 | Low | Closed | Engineering-only docs that intentionally mention prohibited env/private-key names now include explicit boundary notes. Public docs policy remains: no private names, secrets, local paths, internal server material, or overbroad quantum claims. |

## Verification

### QubitorNetwork

- Commit context: `33b5898` plus local audit-closure edits.
- `pnpm testnet:readiness`: pass.
- `QUBITOR_MAINNET_GATE_FETCH_TIMEOUT_MS=10000 pnpm mainnet:security-gate`: pass.

The mainnet security gate ran the build, typecheck, full test suite, CoreGeth tests, contract tests, PQ acceptance, testnet readiness, peer diversity checks, public RPC namespace probes, Docker image checks, SDK/package checks, and bridge gate checks.

### qubitor-bridge

- Commit context: `98c5369` plus local bridge readiness/refundable-disposition edits.
- `pnpm typecheck`: pass.
- `pnpm bridge:readiness:testnet`: pass.
- `pnpm bridge:mainnet:gate`: pass.
- `pnpm bridge:diagnose:testnet`: pass with documented stale refundables.

Current live bridge evidence:

- Relayer mode: `execute`.
- Watchers enabled: `true`.
- Guardian mode: `threshold`.
- Sepolia confirmations: `32`.
- Qubitor confirmations: `50`.
- Pending messages: `0`.
- Failed messages: `0`.
- Reorged messages: `0`.
- Stuck messages: `0`.
- Refundable messages: `4`, documented as stale testnet deadline-expired artifacts.

### QubitScan

- Commit context: `758bb77` plus local address E2E edits.
- `pnpm typecheck`: pass.
- `pnpm build`: pass.
- `pnpm e2e:address`: pass, 4 tests.

Covered browser routes:

- `/explorer/address/0x29FC91357258B6Eb942dA93e4564a4A180B42f1C`
- `/explorer/address/0x133bee9f2f023a2d97e5fafff945aa76de7e64d9`
- `/explorer/address/0x000000000000000000000000000000000000dEaD`
- `/explorer/address/0xnot-an-address`

## Remaining Launch Blockers

1. Finish release hygiene: split dirty worktrees into focused PRs, merge, and tag the exact release commit.
2. Attach real external-audit closure evidence in `audits/external-audit/` with auditor, scope, audited commit/tag, report hash/path, findings summary, remediation commits, and retest status.
3. Complete operator disposition for the 4 stale bridge refundable messages before a launch rehearsal, or keep them explicitly excluded as testnet-only artifacts.
4. Re-run the full internal audit and final gate from the clean release tag.

## Claim Boundary

Supported after this closure pass:

- Public RPC hardening remains verified by the mainnet security gate.
- Bridge readiness and mainnet gate pass against the configured live testnet stack.
- QubitScan address-route client-side crash regression coverage exists and passes locally.
- Engineering-only docs and public docs now carry clearer boundaries.

Still not claimed:

- Final mainnet readiness from this addendum alone.
- External audit completion.
- “Fully quantum-proof,” “unhackable,” or “forever quantum-proof.”

