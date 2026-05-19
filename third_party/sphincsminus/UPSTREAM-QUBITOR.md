# SPHINCS- Upstream Snapshot

This directory vendors Vitalik Buterin's `sphincsminus` repository as a Qubitor research dependency.

- Upstream: https://github.com/vbuterin/sphincsminus
- Qubitor fork: https://github.com/Quantx256hash/sphincsminus
- Snapshot commit: `0508acbfa7a4826a09d40681cdda123d7999d1cf`
- Upstream commit date: `2026-05-10T16:08:26Z`
- License noted upstream: Apache 2.0

Qubitor integration status:

- Research only.
- Not enabled as a consensus precompile.
- Not used by default Qubitor Accounts.
- Not a replacement for the ML-DSA-65 account-control path.

Promotion into protocol code requires a separate Qubitor design review, standardized SLH-DSA comparison, implementation review, gas benchmarking, and external cryptography review.
