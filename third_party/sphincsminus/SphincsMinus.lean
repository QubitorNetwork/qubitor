import SphincsMinus.SHA3
import SphincsMinus.Hash
import SphincsMinus.WOTS
import SphincsMinus.FORS
import SphincsMinus.Scheme
import SphincsMinus.CLI
import SphincsMinus.Test

/-! ## SPHINCS- Hash-Based Signature Scheme (EVM-Optimized)

A pure-Lean implementation of SPHINCS- (single-tree, no hypertree, no WOTS-FORS
hybrid) with deterministic key generation, signing, and verification.
Built for byte-for-byte cross-compatibility with the companion Python
reference implementation.

Test parameters: n=16, h=4, d=2, a=3, k=3, w=16.
-/
