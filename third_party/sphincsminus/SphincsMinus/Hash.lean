/-
Copyright (c) 2026 Vitalik Buterin. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
Authors: Vitalik Buterin
-/
import SphincsMinus.SHA3

/-!
# Hash Functions for SPHINCS-

We use SHA3-256 (pure Lean) truncated to `n` bytes as the underlying hash
function.  In a real deployment this would be KECCAK256; the construction is
identical up to the padding rule.

Domain separation follows the SPHINCS+ ADRS convention: a 32-byte address is
prepended to the message before hashing.  We implement the five SPHINCS+
hash functions:

- `F` : `pk.seed || adrs || M` → `n` bytes
- `H` : `pk.seed || adrs || M₁ || M₂` → `n` bytes
- `Tₗ` : `pk.seed || adrs || M` → `n` bytes (for WOTS chains)
- `H_msg` : `R || pk.seed || pk.root || M` → `m` bytes (message digest)
- `PRF` : `sk.seed || adrs` → `n` bytes
- `PRF_msg` : `sk.prf || opt || M` → `n` bytes
-/

namespace SphincsMinus

/-- A `HashCtx` holds the public seed used for domain-separated hashing. -/
structure HashCtx where
  n : Nat
  pkSeed : ByteArray
  deriving Inhabited

/-- Truncate or pad a ByteArray to exactly `n` bytes. -/
def padToNBytes (data : ByteArray) (n : Nat) : ByteArray :=
  if data.size < n then
    let padLen := n - data.size
    let zeros := ByteArray.mk (List.toArray (List.replicate padLen (0 : UInt8)))
    data ++ zeros
  else
    data.extract 0 n

/-- Core hashing: SHA3-256 of the concatenation, truncated to `n` bytes. -/
def hashN (ctx : HashCtx) (data : ByteArray) : ByteArray :=
  padToNBytes (sha3_256 data) ctx.n

/-- F: pk.seed || adrs || M₁ → n bytes (single-input hash) -/
def hashF (ctx : HashCtx) (adrs : ByteArray) (m : ByteArray) : ByteArray :=
  hashN ctx (ctx.pkSeed ++ adrs ++ m)

/-- H: pk.seed || adrs || M₁ || M₂ → n bytes (two-input hash) -/
def hashH (ctx : HashCtx) (adrs : ByteArray) (m₁ m₂ : ByteArray) : ByteArray :=
  hashN ctx (ctx.pkSeed ++ adrs ++ m₁ ++ m₂)

/-- Tₗ: pk.seed || adrs || M → n bytes (iteration hash for WOTS chains) -/
def hashT (ctx : HashCtx) (adrs : ByteArray) (m : ByteArray) : ByteArray :=
  hashN ctx (ctx.pkSeed ++ adrs ++ m)

/-- H_msg: R || pk.seed || pk.root || M → n bytes (message digest) -/
def hashMsg (ctx : HashCtx) (pkRoot : ByteArray) (r : ByteArray) (msg : ByteArray) : ByteArray :=
  hashN ctx (r ++ ctx.pkSeed ++ pkRoot ++ msg)

/-- PRF: sk.seed || adrs → n bytes -/
def hashPRF (n : Nat) (skSeed : ByteArray) (adrs : ByteArray) : ByteArray :=
  padToNBytes (sha3_256 (skSeed ++ adrs)) n

/-- PRF_msg: sk.prf || opt || M → n bytes -/
def hashPRFMsg (n : Nat) (skPrf : ByteArray) (opt : ByteArray) (msg : ByteArray) : ByteArray :=
  padToNBytes (sha3_256 (skPrf ++ opt ++ msg)) n

end SphincsMinus
