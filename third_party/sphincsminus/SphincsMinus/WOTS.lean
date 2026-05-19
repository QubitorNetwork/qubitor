/-
Copyright (c) 2026 Vitalik Buterin. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
Authors: Vitalik Buterin
-/
import SphincsMinus.Hash

/-!
# WOTS+ — Winternitz One-Time Signature Scheme

Implements standard WOTS+ with checksum, as specified in FIPS 205 §5.

## Parameters

- `n` : hash output size (bytes)
- `w` : Winternitz parameter (power of 2, typically 16)
- `log_w` : bits per digit = log₂(w)
- `l₁` : number of message chains = ⌈8n / log_w⌉
- `l₂` : number of checksum chains = ⌊log(l₁·(w-1)) / log_w⌋ + 1
- `l` : total chains = l₁ + l₂

## ADRS type constants

- `WOTS_HASH = 0` — used during chain iteration
- `WOTS_PK = 1` — used when hashing chains into the public key
- `WOTS_PRF = 5` — used for secret key generation
-/

namespace SphincsMinus

open SphincsMinus

def WOTS_HASH : UInt8 := 0
def WOTS_PK   : UInt8 := 1
def WOTS_PRF  : UInt8 := 5

/-- Compute log₂(w). Assumes w is a power of 2. -/
def log2 (w : Nat) : Nat :=
  let rec go (x : Nat) (acc : Nat) : Nat :=
    if x ≤ 1 then acc else go (x / 2) (acc + 1)
  go w 0

/-- WOTS parameters derived from n and w. -/
structure WotsParams where
  n    : Nat
  w    : Nat
  logW : Nat
  l1   : Nat
  l2   : Nat
  l    : Nat
  deriving Inhabited

/-- Compute WOTS parameters. -/
def wotsParams (n w : Nat) : WotsParams :=
  let logW := log2 w
  let l1 := (8 * n + logW - 1) / logW
  let l2 := (((l1 * (w - 1)).log2) / logW) + 1
  { n, w, logW, l1, l2, l := l1 + l2 }

/-- Convert a byte to base-w digits (big-endian within the byte).

    Returns `logW` bits at a time from most significant to least. -/
def byteToDigits (b : UInt8) (logW : Nat) (w : Nat) : List Nat :=
  let rec go (pos : Nat) (acc : List Nat) : List Nat :=
    if pos = 0 then acc
    else
      let shift := (pos - 1) * logW
      let digit := (b.toNat >>> shift) % w
      go (pos - 1) (digit :: acc)
  let steps := 8 / logW
  go steps [] |>.reverse

/-- Convert a ByteArray to base-w digits.

    Returns exactly `outLen` digits (truncates or left-pads with zeros). -/
def toBaseW (data : ByteArray) (w logW outLen : Nat) : List Nat :=
  let allDigits := ((List.range data.size).map λ i =>
    byteToDigits data[i]! logW w) |>.flatten
  let d := allDigits.length
  if d ≥ outLen then
    -- Take the first outLen digits (most significant bits first)
    allDigits.take outLen
  else
    -- Pad with zeros at the front
    (List.replicate (outLen - d) 0) ++ allDigits

/-- Convert an integer to big-endian bytes, then to base-w digits.

    Returns exactly `outLen` digits. -/
def intToBaseW (x : Nat) (w logW byteLen outLen : Nat) : List Nat :=
  let rec go (remaining : Nat) (pos : Nat) (acc : List UInt8) : List UInt8 :=
    if pos = 0 then acc.reverse
    else
      let shift := (pos - 1) * 8
      let b := ((remaining >>> shift) % 256).toUInt8
      go (remaining - (b.toNat <<< shift)) (pos - 1) (b :: acc)
  let bytes := go x byteLen []
  let ba := ByteArray.mk (bytes.toArray)
  toBaseW ba w logW outLen

/-- Compute WOTS+ checksum digits from message digits. -/
def wotsChecksum (digits : List Nat) (w l2 logW : Nat) : List Nat :=
  let csum := (digits.map λ d => (w - 1) - d).sum
  let byteLen := (l2 * logW + 7) / 8
  intToBaseW csum w logW byteLen l2

/-- Build a SPHINCS- ADRS (32 bytes).  Matches Python byte-for-byte.

  All fields big-endian uint32:
  - Bytes  0– 3: layer address
  - Bytes  4– 7: tree address (bits 96–64)
  - Bytes  8–11: tree address (bits 63–32)
  - Bytes 12–15: tree address (bits 31–0)
  - Bytes 16–19: type (WOTS_HASH=0, FORS_TREE=3, FORS_ROOTS=4, etc.)
  - Bytes 20–23: key-pair address
  - Bytes 24–27: chain address
  - Bytes 28–31: hash address -/
def makeAdrs (layer : Nat) (tree : Nat) (typ : UInt8)
             (kpAddr : Nat := 0) (chainAddr : Nat := 0) (hashAddr : Nat := 0) :
             ByteArray :=
  let be4 (x : Nat) : ByteArray :=
    ByteArray.mk #[
      ((x >>> 24) &&& 0xFF).toUInt8,
      ((x >>> 16) &&& 0xFF).toUInt8,
      ((x >>> 8) &&& 0xFF).toUInt8,
      (x &&& 0xFF).toUInt8
    ]
  be4 layer ++
    be4 ((tree >>> 64) &&& 0xFFFFFFFF) ++
    be4 ((tree >>> 32) &&& 0xFFFFFFFF) ++
    be4 (tree &&& 0xFFFFFFFF) ++
    be4 typ.toNat ++ be4 kpAddr ++ be4 chainAddr ++ be4 hashAddr

/-- Set a single byte in a ByteArray at the given index. -/
def setByte (ba : ByteArray) (idx : Nat) (b : UInt8) : ByteArray :=
  let arr := ba.data
  ByteArray.mk (arr.set! idx b)

/-- Set bytes 16-19 (type field) in ADRS (big-endian uint32). -/
def adrsSetType (adrs : ByteArray) (typ : UInt8) : ByteArray :=
  -- Write typ as BE uint32: 00 00 00 typ
  let a := setByte adrs 16 0
  let a := setByte a 17 0
  let a := setByte a 18 0
  setByte a 19 typ

/-- Set bytes 20-23 (key-pair address) in ADRS (big-endian). -/
def adrsSetKpAddr (adrs : ByteArray) (addr : Nat) : ByteArray :=
  let a := setByte adrs 20 ((addr >>> 24) &&& 0xFF).toUInt8
  let a := setByte a 21 ((addr >>> 16) &&& 0xFF).toUInt8
  let a := setByte a 22 ((addr >>> 8) &&& 0xFF).toUInt8
  setByte a 23 (addr &&& 0xFF).toUInt8

/-- Set bytes 24-27 (chain address) in ADRS (big-endian). -/
def adrsSetChainAddr (adrs : ByteArray) (addr : Nat) : ByteArray :=
  let a := setByte adrs 24 ((addr >>> 24) &&& 0xFF).toUInt8
  let a := setByte a 25 ((addr >>> 16) &&& 0xFF).toUInt8
  let a := setByte a 26 ((addr >>> 8) &&& 0xFF).toUInt8
  setByte a 27 (addr &&& 0xFF).toUInt8

/-- Set bytes 28-31 (hash address) in ADRS (big-endian). -/
def adrsSetHashAddr (adrs : ByteArray) (addr : Nat) : ByteArray :=
  let a := setByte adrs 28 ((addr >>> 24) &&& 0xFF).toUInt8
  let a := setByte a 29 ((addr >>> 16) &&& 0xFF).toUInt8
  let a := setByte a 30 ((addr >>> 8) &&& 0xFF).toUInt8
  setByte a 31 (addr &&& 0xFF).toUInt8

/-- Generate secret key values for WOTS+. -/
def wotsSkGen (params : WotsParams) (skSeed : ByteArray) (adrs : ByteArray) :
    List ByteArray :=
  let n := params.n
  (List.range params.l).map λ i =>
    let a := adrsSetKpAddr (adrsSetType adrs WOTS_PRF) i
    hashPRF n skSeed a

/-- WOTS+ chain: iterate T_l `steps` times starting from value `x` at
    chain position `start`. -/
def wotsChain (ctx : HashCtx) (adrs : ByteArray) (x : ByteArray)
              (start : Nat) (steps : Nat) : ByteArray :=
  let rec go (a : ByteArray) (val : ByteArray) (i : Nat) (remaining : Nat) : ByteArray :=
    if remaining = 0 then val
    else
      let a' := adrsSetChainAddr a i
      let val' := hashT ctx a' val
      go a val' (i + 1) (remaining - 1)
  go (adrsSetType adrs WOTS_HASH) x start steps

/-- Compute WOTS+ public key from secret keys. -/
def wotsPkFromSk (ctx : HashCtx) (params : WotsParams) (adrs : ByteArray)
                 (sk : List ByteArray) : ByteArray :=
  let w := params.w
  let tmp := ((List.range params.l).map λ i =>
    let a := adrsSetKpAddr (adrsSetType adrs WOTS_HASH) i
    let chainFinal := wotsChain ctx a sk[i]! 0 (w - 1)
    chainFinal.data.toList) |>.flatten
  let tmpBa := ByteArray.mk (List.toArray tmp)
  let aPk := adrsSetType adrs WOTS_PK
  hashT ctx aPk tmpBa

/-- Sign a message with WOTS+.

    Returns the list of l chain values. -/
def wotsSign (ctx : HashCtx) (params : WotsParams) (skSeed : ByteArray)
             (adrs : ByteArray) (msg : ByteArray) : List ByteArray :=
  let w := params.w
  let logW := params.logW
  let l1 := params.l1
  let l2 := params.l2
  let l := params.l

  -- Convert message to base-w digits
  let msgDigits := toBaseW msg w logW l1
  -- Compute checksum digits
  let csumDigits := wotsChecksum msgDigits w l2 logW
  let fullDigits := msgDigits ++ csumDigits

  -- Generate secret keys
  let sk := wotsSkGen params skSeed adrs

  -- Chain each secret according to its digit
  (List.range l).map λ i =>
    let d := fullDigits[i]!
    let a := adrsSetKpAddr (adrsSetType adrs WOTS_HASH) i
    wotsChain ctx a sk[i]! 0 d

/-- Verify a WOTS+ signature and recover the public key. -/
def wotsPkFromSig (ctx : HashCtx) (params : WotsParams) (adrs : ByteArray)
                  (sig : List ByteArray) (msg : ByteArray) : ByteArray :=
  let w := params.w
  let logW := params.logW
  let l1 := params.l1
  let l2 := params.l2
  let l := params.l

  -- Recover the full digit sequence
  let msgDigits := toBaseW msg w logW l1
  let csumDigits := wotsChecksum msgDigits w l2 logW
  let fullDigits := msgDigits ++ csumDigits

  -- Complete each chain to w-1
  let tmp := ((List.range l).map λ i =>
    let d := fullDigits[i]!
    let a := adrsSetKpAddr (adrsSetType adrs WOTS_HASH) i
    let chainFinal := wotsChain ctx a sig[i]! d (w - 1 - d)
    chainFinal.data.toList) |>.flatten
  let tmpBa := ByteArray.mk (List.toArray tmp)
  let aPk := adrsSetType adrs WOTS_PK
  hashT ctx aPk tmpBa

end SphincsMinus

