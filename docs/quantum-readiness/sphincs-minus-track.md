# SPHINCS- Research Track

Qubitor vendors Vitalik Buterin's `sphincsminus` repository as an experimental hash-based PQ signature research track.

- Upstream: https://github.com/vbuterin/sphincsminus
- Qubitor fork: https://github.com/Quantx256hash/sphincsminus
- Vendored snapshot: `third_party/sphincsminus`
- Snapshot commit: `0508acbfa7a4826a09d40681cdda123d7999d1cf`

## Status

Research only.

SPHINCS- is not part of Qubitor consensus today. It is not registered as a precompile, not accepted by `QubitorAccount`, and not a default wallet signing mode.

The current default Qubitor Account control path remains ML-DSA-65 through the Qubitor precompile at:

```text
0x0000000000000000000000000000000000000100
```

This research track exists because hash-based signatures give Qubitor cryptographic diversity. If a lattice assumption weakens, a stateless hash-based family such as SLH-DSA is the natural fallback class.

## Why It Is Useful

- It is small enough to audit as a reference implementation.
- It uses WOTS+, FORS+C, and a SPHINCS-style tree, which are close to the hash-based design space standardized by NIST SLH-DSA/FIPS 205.
- It is designed with EVM friendliness in mind: byte-oriented public inputs and Keccak/SHA3-like hashing.
- It makes the cost tradeoff concrete. The C7 parameter profile has roughly 3.6 KB serialized signatures but about 131 KB public keys, so Qubitor would need a commitment, registry, or precompile-friendly public-key storage design before this could be practical for accounts.

## Current Local Evidence

Run:

```sh
pnpm research:sphincs-minus:smoke
```

The smoke test runs the vendored Python component tests, verifies the upstream test vector, and asserts the Qubitor size profile used for planning.

## Promotion Gates

Before SPHINCS- or a related hash-based scheme can move from research to protocol design:

- Compare it directly against standardized SLH-DSA/FIPS 205 parameter sets.
- Decide whether Qubitor wants an exact SLH-DSA implementation, SPHINCS- as a separate experimental family, or both.
- Produce a Go or Rust verifier with deterministic test vectors and consensus-safe input parsing.
- Benchmark gas and precompile execution cost for public-key, message, context, and signature sizes.
- Design account storage around the large public key footprint.
- Add threat-model language that distinguishes ML-DSA default accounts from any hash-based fallback mode.
- Complete external cryptography review before any public claim depends on it.
