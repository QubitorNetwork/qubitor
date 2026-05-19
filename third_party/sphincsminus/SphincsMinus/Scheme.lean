/-
Copyright (c) 2026 Vitalik Buterin. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
Authors: Vitalik Buterin
-/
import SphincsMinus.Hash
import SphincsMinus.WOTS
import SphincsMinus.FORS

/-!
# SPHINCS- Top-Level Scheme

Keygen, sign, and verify for SPHINCS- (d=2 hypertree, FORS+C).
-/

namespace SphincsMinus

open SphincsMinus

def TREE : UInt8 := 2

structure SphincsParams where
  n      : Nat
  h      : Nat
  d      : Nat
  hPrime : Nat
  a      : Nat
  k      : Nat
  w      : Nat
  deriving Inhabited

def defaultParams : SphincsParams :=
  { n := 16, h := 4, d := 2, hPrime := 2, a := 3, k := 3, w := 16 }

/-- Build Merkle tree, return root. -/
def xmssTreehash (ctx : HashCtx) (adrs : ByteArray) (leaves : List ByteArray)
                 (height : Nat) : ByteArray :=
  let rec go (level : Nat) (nodes : List ByteArray) : ByteArray :=
    if level ≥ height then nodes[0]!
    else
      let next := (List.range (nodes.length / 2)).map λ i =>
        let nodeAdrs := adrsSetType adrs TREE
        let nodeAdrs := adrsSetHashAddr nodeAdrs level
        let nodeAdrs := adrsSetChainAddr nodeAdrs i
        hashH ctx nodeAdrs nodes[(2*i)]! nodes[(2*i+1)]!
      go (level + 1) next
  go 0 leaves

/-- Build auth path for a leaf. -/
def buildXMSSAuthPath (ctx : HashCtx) (adrs : ByteArray)
                      (leaves : List ByteArray) (leafIdx height : Nat) : List ByteArray :=
  let rec go (level : Nat) (nodes : List ByteArray) (idx : Nat) (acc : List ByteArray) : List ByteArray :=
    if level ≥ height then acc.reverse
    else
      let siblingIdx := (idx.xor 1)
      let sibling := nodes[siblingIdx]!
      let next := (List.range (nodes.length / 2)).map λ i =>
        let nodeAdrs := adrsSetType adrs TREE
        let nodeAdrs := adrsSetHashAddr nodeAdrs level
        let nodeAdrs := adrsSetChainAddr nodeAdrs i
        hashH ctx nodeAdrs nodes[(2*i)]! nodes[(2*i+1)]!
      go (level + 1) next (idx / 2) (sibling :: acc)
  go 0 leaves leafIdx []

/-- Compute node from leaf and auth path. -/
def xmssPkFromSig (ctx : HashCtx) (adrs : ByteArray)
                  (leaf : ByteArray) (authPath : List ByteArray)
                  (leafIdx height : Nat) : ByteArray :=
  let rec go (level : Nat) (node : ByteArray) (idx : Nat) : ByteArray :=
    if level ≥ height then node
    else
      let sibling := authPath[level]!
      let nodeAdrs := adrsSetType adrs TREE
      let nodeAdrs := adrsSetHashAddr nodeAdrs level
      let nodeAdrs := adrsSetChainAddr nodeAdrs (idx / 2)
      let nextNode :=
        if idx % 2 == 1 then hashH ctx nodeAdrs sibling node
        else hashH ctx nodeAdrs node sibling
      go (level + 1) nextNode (idx / 2)
  go 0 leaf leafIdx

/-- Convert ByteArray to Nat (big-endian, up to 16 bytes). -/
def bytesToNat (ba : ByteArray) : Nat :=
  let rec go (i : Nat) (acc : Nat) : Nat :=
    if i ≥ ba.size then acc else go (i + 1) (acc * 256 + ba[i]!.toNat)
  go 0 0

/-- Convert Nat to fixed-width ByteArray (big-endian). -/
def natToBytes (x : Nat) (len : Nat) : ByteArray :=
  let rec go (pos : Nat) : List UInt8 :=
    if pos = 0 then []
    else
      let shift := (pos - 1) * 8
      let b := ((x >>> shift) &&& 0xFF).toUInt8
      b :: go (pos - 1)
  ByteArray.mk (List.toArray (go len))

def packPrivkey (skSeed skPrf : ByteArray) : ByteArray := skSeed ++ skPrf
def unpackPrivkey (key : ByteArray) (n : Nat) : ByteArray × ByteArray :=
  (key.extract 0 n, key.extract n (n + n))

def packPubkey (params : SphincsParams) (pkSeed pkRoot : ByteArray)
               (forsKeys : List (ByteArray × ByteArray)) : ByteArray :=
  let header := List.toArray
    [ (params.n &&& 0xFF).toUInt8, 0, 0, 0
    , (params.h &&& 0xFF).toUInt8, 0, 0, 0
    , (params.d &&& 0xFF).toUInt8, 0, 0, 0
    , (params.a &&& 0xFF).toUInt8, 0, 0, 0
    , (params.k &&& 0xFF).toUInt8, 0, 0, 0
    , (params.w &&& 0xFF).toUInt8, 0, 0, 0
    ]
  let forsData := forsKeys.foldl (λ acc (lr, pk) => acc ++ lr ++ pk) ByteArray.empty
  (ByteArray.mk header) ++ pkSeed ++ pkRoot ++ forsData

/-- Keygen: derive seeds, build FORS+C keypairs, build bottom XMSS root. -/
partial def sphincsKeygen (params : SphincsParams)
                          (skSeedIn : Option ByteArray := none)
                          (skPrfIn : Option ByteArray := none) :
                          ByteArray × ByteArray × ByteArray × ByteArray ×
                          List (ByteArray × ByteArray) :=
  let n := params.n
  let hPrime := params.hPrime
  let w := params.w
  let wotsP := wotsParams n w
  let forsP := forsParams params.k params.a

  -- Derive seeds.  Matches Python: sha3_256(b"sk_seed_spx_minus_00000000")[:n] etc.
  -- If skSeedIn / skPrfIn are supplied, use them directly (from privtopub).
  -- pkSeed is always derived deterministically.
  let defaultSeedBytes : ByteArray :=
    ByteArray.mk (List.toArray ("sk_seed_spx_minus_00000000".toList.map λ c => (c.toNat).toUInt8))
  let defaultPrfBytes : ByteArray :=
    ByteArray.mk (List.toArray ("sk_prf_spx_minus_00000000".toList.map λ c => (c.toNat).toUInt8))
  let pkSeedBytes : ByteArray :=
    ByteArray.mk (List.toArray ("pk_seed_spx_minus_00000000".toList.map λ c => (c.toNat).toUInt8))
  let skSeed := skSeedIn.getD ((sha3_256 defaultSeedBytes).extract 0 n)
  let skPrf := skPrfIn.getD ((sha3_256 defaultPrfBytes).extract 0 n)
  let pkSeed := (sha3_256 pkSeedBytes).extract 0 n
  let ctx : HashCtx := { n, pkSeed }

  -- FORS+C keypairs for each bottom leaf
  let numBottomLeaves := 1 <<< hPrime
  let forsKeys : List (ByteArray × ByteArray) :=
    (List.range numBottomLeaves).map λ leafIdx =>
      let forsAdrs := makeAdrs (params.d - 1) leafIdx FORS_TREE
      forsCPk ctx n skSeed forsAdrs forsP

  -- Bottom XMSS: WOTS+ PKs as leaves
  let leaves : List ByteArray :=
    (List.range numBottomLeaves).map λ leafIdx =>
      let wotsAdrs := makeAdrs (params.d - 1) 0 WOTS_HASH leafIdx
      let wsk := wotsSkGen wotsP skSeed wotsAdrs
      wotsPkFromSk ctx wotsP wotsAdrs wsk

  let treeAdrs := makeAdrs (params.d - 1) 0 TREE
  let pkRoot := xmssTreehash ctx treeAdrs leaves hPrime

  (skSeed, skPrf, pkSeed, pkRoot, forsKeys)

/-- Sign a message. Returns (R, counter, forsVals, forsAuth, wotsSig, authPath). -/
partial def sphincsSign (params : SphincsParams) (skSeed skPrf pkSeed pkRoot : ByteArray)
                        (msg : ByteArray) (forsKeys : List (ByteArray × ByteArray))
                        (leafUsage : Nat := 0) :
                        ByteArray × ByteArray × List ByteArray × List (List ByteArray) ×
                        List ByteArray × List ByteArray :=
  let n := params.n
  let hPrime := params.hPrime
  let w := params.w
  let wotsP := wotsParams n w
  let forsP := forsParams params.k params.a
  let ctx : HashCtx := { n, pkSeed }

  -- Step 1: Randomized message digest
  let opt := pkRoot ++ natToBytes leafUsage 4
  let R := hashPRFMsg n skPrf opt msg
  let mdFull := hashMsg ctx pkRoot R msg
  let mdNat := bytesToNat mdFull
  let leafMask := (1 <<< hPrime) - 1
  let idxLeaf := mdNat &&& leafMask

  -- Extract FORS message bits
  let forsBits := mdNat >>> hPrime
  let forsMask := (1 <<< (params.k * params.a)) - 1
  let forsMD := forsBits &&& forsMask
  let forsBytesLen := (params.k * params.a + 7) / 8
  let forsMDBytes := natToBytes forsMD forsBytesLen

  -- Step 2: FORS+C sign
  let forsAdrs := makeAdrs (params.d - 1) idxLeaf FORS_TREE
  let (counter, forsVals, forsAuth) :=
    forsCSign ctx n skSeed forsAdrs forsMDBytes forsP

  -- Step 3: Bottom XMSS WOTS+ signs (last_root || pk_fors)
  let (lastRoot, pkFors) := forsKeys[idxLeaf]!
  let wotsMsg := lastRoot ++ pkFors
  let wotsAdrs := makeAdrs (params.d - 1) 0 WOTS_HASH idxLeaf
  let wotsSig := wotsSign ctx wotsP skSeed wotsAdrs wotsMsg

  -- Step 4: Build bottom XMSS auth path
  let numBottomLeaves := 1 <<< hPrime
  let bottomLeaves : List ByteArray :=
    (List.range numBottomLeaves).map λ i =>
      let wotsAdrs' := makeAdrs (params.d - 1) 0 WOTS_HASH i
      let w := wotsSkGen wotsP skSeed wotsAdrs'
      wotsPkFromSk ctx wotsP wotsAdrs' w
  let treeAdrs := makeAdrs (params.d - 1) 0 TREE
  let authPath := buildXMSSAuthPath ctx treeAdrs bottomLeaves idxLeaf hPrime

  (R, counter, forsVals, forsAuth, wotsSig, authPath)

/-- Verify a signature. -/
partial def sphincsVerify (params : SphincsParams) (pkSeed pkRoot : ByteArray)
                          (msg : ByteArray)
                          (sig : ByteArray × ByteArray × List ByteArray ×
                                 List (List ByteArray) × List ByteArray × List ByteArray)
                          (forsKeys : List (ByteArray × ByteArray))
                          (_leafUsage : Nat := 0) : Bool :=
  let n := params.n
  let hPrime := params.hPrime
  let w := params.w
  let wotsP := wotsParams n w
  let forsP := forsParams params.k params.a
  let ctx : HashCtx := { n, pkSeed }

  let (R, counter, forsVals, forsAuth, wotsSig, authPath) := sig

  -- Step 1: Recover message digest
  let mdFull := hashMsg ctx pkRoot R msg
  let mdNat := bytesToNat mdFull
  let leafMask := (1 <<< hPrime) - 1
  let idxLeaf := mdNat &&& leafMask

  let forsBits := mdNat >>> hPrime
  let forsMask := (1 <<< (params.k * params.a)) - 1
  let forsMD := forsBits &&& forsMask
  let forsBytesLen := (params.k * params.a + 7) / 8
  let forsMDBytes := natToBytes forsMD forsBytesLen

  -- Step 2: FORS+C verify
  let forsAdrs := makeAdrs (params.d - 1) idxLeaf FORS_TREE
  let (lastRoot, pkFors) := forsKeys[idxLeaf]!
  if ¬ (forsCVerify ctx forsAdrs counter forsVals forsAuth lastRoot pkFors
                     forsMDBytes forsP) then
    false
  else
    -- Step 3: Recover WOTS PK from signature
    let wotsMsg := lastRoot ++ pkFors
    let wotsAdrs := makeAdrs (params.d - 1) 0 WOTS_HASH idxLeaf
    let recoveredWotsPk := wotsPkFromSig ctx wotsP wotsAdrs wotsSig wotsMsg

    -- Step 4: Hash up Merkle tree
    let treeAdrs := makeAdrs (params.d - 1) 0 TREE
    let node := xmssPkFromSig ctx treeAdrs recoveredWotsPk authPath
                              idxLeaf hPrime

    -- Step 5: Check against public key root
    node == pkRoot

end SphincsMinus
