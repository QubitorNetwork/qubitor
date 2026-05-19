/-
Copyright (c) 2026 Vitalik Buterin. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
Authors: Vitalik Buterin

SHA-3 / Keccak-f[1600] in pure Lean 4 (no FFI).
Implements FIPS 202: SHA3-256.
-/

namespace SphincsMinus

open UInt64

/-! ## Keccak-f[1600] permutation

State is 25 64-bit lanes (5×5), stored as flat array. Lane (x,y) → idx = x + 5*y. -/

def NROUNDS : Nat := 24

/-- Rotation offsets for ρ step (lanes in order x + 5*y). -/
def rhoLUT : Array Nat := #[
  0,  1,  62, 28, 27,
  36, 44, 6,  55, 20,
   3, 10, 43, 25, 39,
  41, 45, 15, 21,  8,
  18,  2, 61, 56, 14
]

/-- π step: (x,y) → (y, 2x+3y mod 5). Precomputed newIdx for each oldIdx. -/
def piLUT : Array Nat :=
  let orig : List (Nat × Nat) :=
    ((List.range 5).map λ y => (List.range 5).map λ x => (x, y)).flatten
  let newIndices := orig.map λ (x, y) =>
    let newX := y
    let newY := (2*x + 3*y) % 5
    newX + 5*newY
  List.toArray newIndices

/-- Round constants RC[i] for Keccak-f[1600]. -/
def roundConstants : Array UInt64 := #[
  0x0000000000000001, 0x0000000000008082, 0x800000000000808A,
  0x8000000080008000, 0x000000000000808B, 0x0000000080000001,
  0x8000000080008081, 0x8000000000008009, 0x000000000000008A,
  0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
  0x000000008000808B, 0x800000000000008B, 0x8000000000008089,
  0x8000000000008003, 0x8000000000008002, 0x8000000000000080,
  0x000000000000800A, 0x800000008000000A, 0x8000000080008081,
  0x8000000000008080, 0x0000000080000001, 0x8000000080008008
]

/-- Left-rotate a 64-bit word by n bits. -/
def rotl64 (x : UInt64) (n : Nat) : UInt64 :=
  (x <<< (n.toUInt64)) ||| (x >>> ((64 - n).toUInt64))

/-- Access lane i of state array. -/
@[inline] def lane (s : Array UInt64) (i : Nat) : UInt64 := s[i]!

/-- Single Keccak-f[1600] round. -/
def keccakRound (state : Array UInt64) (rc : UInt64) : Array UInt64 :=
  -- Step θ
  let C : Array UInt64 :=
    (List.range 5).toArray.map λ x =>
      lane state x ^^^ lane state (x+5) ^^^ lane state (x+10) ^^^
      lane state (x+15) ^^^ lane state (x+20)
  let D : Array UInt64 :=
    (List.range 5).toArray.map λ x =>
      let cl := lane C ((x + 4) % 5)
      let cr := lane C ((x + 1) % 5)
      cl ^^^ rotl64 cr 1
  let state1 : Array UInt64 :=
    (List.range 25).toArray.map λ i =>
      let x := i % 5
      lane state i ^^^ lane D x

  -- Steps ρ and π combined
  let B : Array UInt64 := List.toArray (List.replicate 25 0)
  let B : Array UInt64 := B.set! (piLUT[0]!) (lane state1 0)
  let B : Array UInt64 :=
    (List.range 25).foldl (λ (B' : Array UInt64) i =>
      if i = 0 then B' else B'.set! (piLUT[i]!) (rotl64 (lane state1 i) (rhoLUT[i]!))
    ) B

  -- Step χ
  let state2 : Array UInt64 :=
    (List.range 25).toArray.map λ i =>
      let x := i % 5
      let y := i / 5
      let i1 := ((x + 1) % 5) + 5*y
      let i2 := ((x + 2) % 5) + 5*y
      lane B i ^^^ ((~~~ lane B i1) &&& lane B i2)

  -- Step ι
  let r0 := lane state2 0 ^^^ rc
  state2.set! 0 r0

/-- Full Keccak-f[1600] permutation (24 rounds). -/
def keccakF1600 (state : Array UInt64) : Array UInt64 :=
  (List.range NROUNDS).foldl (λ s r => keccakRound s (roundConstants[r]!)) state

/-! ## SHA3-256

Rate: 1088 bits = 136 bytes. Output: 32 bytes. Padding: 0x06 || 10*1. -/

def SHA3_256_RATE : Nat := 136

/-- Absorb input, returning final state. -/
partial def sha3Absorb (input : ByteArray) (rate : Nat) : Array UInt64 :=
  let zeroState : Array UInt64 := List.toArray (List.replicate 25 0)
  -- Pad: 0x06 then 10*1
  let padTotal := rate - (input.size % rate)
  let padBytes : List UInt8 :=
    if padTotal = 1 then [0x86]
    else [0x06] ++ (List.replicate (padTotal - 2) 0) ++ [0x80]
  let padded := input ++ ByteArray.mk (List.toArray padBytes)

  -- Absorb blocks
  let rec go (pos : Nat) (s : Array UInt64) : Array UInt64 :=
    if pos ≥ padded.size then s
    else
      let chunk := min rate (padded.size - pos)
      let s1 : Array UInt64 :=
        (List.range chunk).foldl (λ (acc : Array UInt64) i =>
          let wordIdx := i / 8
          let byteSh := (i % 8) * 8
          let bv : UInt64 := padded[pos + i]!.toNat.toUInt64
          acc.set! wordIdx (lane acc wordIdx ^^^ (bv <<< (byteSh.toUInt64)))
        ) s
      go (pos + chunk) (keccakF1600 s1)
  go 0 zeroState

/-- Squeeze outputLen bytes from state. -/
partial def sha3Squeeze (state : Array UInt64) (outputLen : Nat) (rate : Nat) : ByteArray :=
  let rec go (pos : Nat) (s : Array UInt64) (acc : List UInt8) : List UInt8 :=
    if pos ≥ outputLen then acc
    else
      let chunk := min rate (outputLen - pos)
      let bytes : List UInt8 :=
        (List.range chunk).map λ i =>
          let wordIdx := i / 8
          let byteSh := (i % 8) * 8
          ((lane s wordIdx >>> (byteSh.toUInt64)) &&& 0xFF).toUInt8
      let acc' := acc ++ bytes
      if pos + chunk ≥ outputLen then acc'
      else go (pos + chunk) (keccakF1600 s) acc'
  ByteArray.mk (List.toArray (go 0 state []))

/-- SHA3-256 of input data. Returns 32 bytes. -/
def sha3_256 (input : ByteArray) : ByteArray :=
  let rate := SHA3_256_RATE
  let outLen := 32
  let absorbed := sha3Absorb input rate
  sha3Squeeze absorbed outLen rate

end SphincsMinus
