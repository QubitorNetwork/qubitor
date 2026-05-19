/-
Copyright (c) 2026 Vitalik Buterin. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
Authors: Vitalik Buterin
-/
import SphincsMinus.Scheme

/-!
# SPHINCS- CLI Utilities

Hex encoding/decoding with `0x` prefix support, matching the Python API.
-/

namespace SphincsMinus

open SphincsMinus

/-- Convert a hex digit character to its numeric value. -/
def hexDigitVal (c : Char) : Option Nat :=
  if '0' ≤ c ∧ c ≤ '9' then some (c.toNat - '0'.toNat)
  else if 'a' ≤ c ∧ c ≤ 'f' then some (c.toNat - 'a'.toNat + 10)
  else if 'A' ≤ c ∧ c ≤ 'F' then some (c.toNat - 'A'.toNat + 10)
  else none

/-- Parse a hex string (optionally 0x-prefixed) into a ByteArray. -/
def parseHex (s : String) : ByteArray :=
  let s' :=
    if s.startsWith "0x" then s.drop 2 |>.toString
    else if s.startsWith "0X" then s.drop 2 |>.toString
    else s
  let chars := s'.toList
  let rec pairBytes (cs : List Char) (acc : List UInt8) : List UInt8 :=
    match cs with
    | c1 :: c2 :: rest =>
      match hexDigitVal c1, hexDigitVal c2 with
      | some a, some b => pairBytes rest (acc ++ [((a * 16 + b) &&& 0xFF).toUInt8])
      | _, _ => acc
    | _ => acc
  ByteArray.mk (List.toArray (pairBytes chars []))

/-- Encode a ByteArray as a 0x-prefixed hex string. -/
def toHex (ba : ByteArray) : String :=
  let hexChars : List Char := "0123456789abcdef".toList
  let rec byteHex (b : UInt8) : List Char :=
    let n := b.toNat
    [hexChars[n / 16]!, hexChars[n % 16]!]
  let parts : List Char :=
    ((List.range ba.size).map λ i => byteHex ba[i]!) |>.flatten
  "0x" ++ String.ofList parts

/-- Pack a 6-tuple signature into a ByteArray (matching Python's format).

    Format (all multi-byte ints little-endian, as in Python):
    - R (n bytes)
    - counter (4 bytes)
    - nfv (4 bytes LE) + for each fv: len (4 bytes LE) + data
    - nfa (4 bytes LE) + for each auth: na (4 bytes LE) + for each s: len (4 LE) + data
    - nw (4 bytes LE) + for each s: len (4 bytes LE) + data
    - na (4 bytes LE) + for each s: len (4 bytes LE) + data -/
def packSignature (sig : ByteArray × ByteArray × List ByteArray ×
                         List (List ByteArray) × List ByteArray × List ByteArray)
                  (n : Nat) : ByteArray :=
  let (R, counter, forsVals, forsAuth, wotsSig, authPath) := sig
  let u32le (x : Nat) : ByteArray :=
    let b0 := (x &&& 0xFF).toUInt8
    let b1 := ((x >>> 8) &&& 0xFF).toUInt8
    let b2 := ((x >>> 16) &&& 0xFF).toUInt8
    let b3 := ((x >>> 24) &&& 0xFF).toUInt8
    ByteArray.mk (List.toArray [b0, b1, b2, b3])
  let result := R
  let result := result ++ counter
  let result := result ++ u32le forsVals.length
  let result := forsVals.foldl (λ acc v => acc ++ u32le v.size ++ v) result
  let result := result ++ u32le forsAuth.length
  let result := forsAuth.foldl (λ acc auth =>
    acc ++ u32le auth.length ++
    auth.foldl (λ a s => a ++ u32le s.size ++ s) ByteArray.empty) result
  let result := result ++ u32le wotsSig.length
  let result := wotsSig.foldl (λ acc s => acc ++ u32le s.size ++ s) result
  let result := result ++ u32le authPath.length
  authPath.foldl (λ acc s => acc ++ u32le s.size ++ s) result

/-- Unpack a packed signature back into a 6-tuple. -/
partial def unpackSignature (data : ByteArray) (n : Nat) :
    ByteArray × ByteArray × List ByteArray × List (List ByteArray) ×
    List ByteArray × List ByteArray :=
  let u32le (pos : Nat) : Nat :=
    data[pos]!.toNat ||| (data[pos+1]!.toNat <<< 8) |||
    (data[pos+2]!.toNat <<< 16) ||| (data[pos+3]!.toNat <<< 24)
  let R := data.extract 0 n
  let pos0 := n
  let counter := data.extract pos0 (pos0 + 4)
  let pos1 := pos0 + 4
  let nfv := u32le pos1
  let pos2 := pos1 + 4
  let rec readList (pos : Nat) (remaining : Nat) (acc : List ByteArray) :
      Nat × List ByteArray :=
    if remaining = 0 then (pos, acc.reverse)
    else
      let itemLen := u32le pos
      let item := data.extract (pos + 4) (pos + 4 + itemLen)
      readList (pos + 4 + itemLen) (remaining - 1) (item :: acc)
  let (pos3, forsVals) := readList pos2 nfv []
  let nfa := u32le pos3
  let pos4 := pos3 + 4
  let rec readAuthList (pos : Nat) (remaining : Nat) (acc : List (List ByteArray)) :
      Nat × List (List ByteArray) :=
    if remaining = 0 then (pos, acc.reverse)
    else
      let na := u32le pos
      let (pos', auth) := readList (pos + 4) na []
      readAuthList pos' (remaining - 1) (auth :: acc)
  let (pos5, forsAuth) := readAuthList pos4 nfa []
  let nw := u32le pos5
  let (pos6, wotsSig) := readList (pos5 + 4) nw []
  let na := u32le pos6
  let (_, authPath) := readList (pos6 + 4) na []
  (R, counter, forsVals, forsAuth, wotsSig, authPath)

/-- Derive public key hex from private key hex. -/
def privtopub (privkeyHex : String) : String :=
  let privkey := parseHex privkeyHex
  let params := defaultParams
  let n := params.n
  let (skSeed, skPrf) := unpackPrivkey privkey n
  let (_, _, pkSeed, pkRoot, forsKeys) := sphincsKeygen params (some skSeed) (some skPrf)
  toHex (packPubkey params pkSeed pkRoot forsKeys)

/-- Sign a string message with a hex private key. Returns hex-encoded signature. -/
def sign (privkeyHex : String) (message : String) : String :=
  let params := defaultParams
  let n := params.n
  let privkey := parseHex privkeyHex
  let (skSeed, skPrf) := unpackPrivkey privkey n
  let (_, _, pkSeed, pkRoot, forsKeys) := sphincsKeygen params (some skSeed) (some skPrf)
  let msg := ByteArray.mk (List.toArray (message.toList.map λ c => (c.toNat).toUInt8))
  let sigTuple := sphincsSign params skSeed skPrf pkSeed pkRoot msg forsKeys
  let sigData := packSignature sigTuple n
  toHex sigData

/-- Verify a hex-encoded signature for a string message against a hex public key.
    Returns "true" or "false". -/
def verify (pubkeyHex : String) (message : String) (sigHex : String) : String :=
  let params := defaultParams
  let n := params.n
  let pubkey := parseHex pubkeyHex
  -- Parse public key into components
  let read32le (pos : Nat) : Nat :=
    pubkey[pos]!.toNat ||| (pubkey[pos+1]!.toNat <<< 8) |||
    (pubkey[pos+2]!.toNat <<< 16) ||| (pubkey[pos+3]!.toNat <<< 24)
  -- Skip header (24 bytes), extract pkSeed and pkRoot
  let hdrLen := 24
  let pkSeedPos := hdrLen
  let pkSeed := pubkey.extract pkSeedPos (pkSeedPos + n)
  let pkRoot := pubkey.extract (pkSeedPos + n) (pkSeedPos + n + n)
  let forsStart := pkSeedPos + n + n
  let numBottomLeaves := 1 <<< params.hPrime
  let rec parseForsKeys (pos : Nat) (remaining : Nat) (acc : List (ByteArray × ByteArray)) :
      List (ByteArray × ByteArray) :=
    if remaining = 0 then acc.reverse
    else
      let lr := pubkey.extract pos (pos + n)
      let pkF := pubkey.extract (pos + n) (pos + n + n)
      parseForsKeys (pos + n + n) (remaining - 1) ((lr, pkF) :: acc)
  let forsKeys := parseForsKeys forsStart numBottomLeaves []
  let msg := ByteArray.mk (List.toArray (message.toList.map λ c => (c.toNat).toUInt8))
  let sigData := parseHex sigHex
  let sigTuple := unpackSignature sigData n
  let ok := sphincsVerify params pkSeed pkRoot msg sigTuple forsKeys
  if ok then "true" else "false"

end SphincsMinus
