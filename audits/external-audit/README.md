# External Audit Closure Register

Status: deferred until the external report or attestation is provided.

This directory is the release register for third-party audit evidence. Do not
mark Qubitor mainnet-ready from external audit claims until this register points
to a real report or attestation and all Critical/High findings are closed or
explicitly accepted with launch approval.

## Required Evidence

Each external audit entry must record:

- auditor or audit firm name;
- report date and report version;
- audited repository, commit hash, and release tag;
- scope, including whether CoreGeth changes, ML-DSA precompile,
  QubitorPQTxV1, Qubitor Accounts, bridge contracts, relayer/backend, and
  deployment/genesis tooling were included;
- report artifact path or public URL;
- report SHA-256 hash;
- finding summary by severity;
- remediation PRs or commits;
- retest date and retest result;
- remaining accepted risks, if any.

## Current Closure State

| Area | Status | Notes |
| --- | --- | --- |
| CoreGeth fork and consensus changes | Deferred | Awaiting external report/attestation. |
| ML-DSA precompile and PQ transaction path | Deferred | Awaiting external report/attestation. |
| Qubitor Account contracts and admin controls | Deferred | Awaiting external report/attestation. |
| Bridge contracts and liquidity vaults | Deferred | Awaiting external report/attestation. |
| Bridge relayer/indexer/monitor/finalizer | Deferred | Awaiting external report/attestation. |
| Genesis, deployment, and launch tooling | Deferred | Awaiting external report/attestation. |

## Template

Copy this block into a dated file when the report is available:

```md
# External Audit Closure: <auditor> <date>

- Auditor:
- Report date:
- Report version:
- Audited repositories:
- Audited commits/tags:
- Scope:
- Report artifact:
- Report SHA-256:
- Critical findings: 0 open / 0 accepted / 0 resolved
- High findings: 0 open / 0 accepted / 0 resolved
- Medium findings:
- Low findings:
- Informational findings:
- Remediation commits:
- Retest result:
- Accepted risks:
- Launch decision:
```
