/-
Copyright (c) 2026 Vitalik Buterin. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
Authors: Vitalik Buterin
-/
import SphincsMinus.Hash
import SphincsMinus.WOTS

/-!
# FORS — Forest of Random Subsets
-/

namespace SphincsMinus

open SphincsMinus

def FORS_TREE  : UInt8 := 3
def FORS_ROOTS : UInt8 := 4
def FORS_PRF   : UInt8 := 6

structure ForsParams where
  k : Nat
  a : Nat
  t : Nat
  deriving Inhabited

def forsParams (k a : Nat) : ForsParams :=
  { k, a, t := 2 ^ a }

/-- Generate FORS secret keys. -/
def forsSkGen (n : Nat) (skSeed : ByteArray) (adrs : ByteArray)
              (params : ForsParams) : List (List ByteArray) :=
  (List.range params.k).map λ i =>
    let a := adrsSetType adrs FORS_PRF
    let a := adrsSetKpAddr a i
    (List.range params.t).map λ j =>
      let a' := adrsSetChainAddr a j
      hashPRF n skSeed a'

/-- Build a FORS Merkle tree from leaves. Returns a list of levels. -/
def forsTreeHash (ctx : HashCtx) (adrs : ByteArray)
                 (skTree : List ByteArray) (a : Nat) : List (List ByteArray) :=
  let rec go (level : Nat) (prev : List ByteArray) : List (List ByteArray) :=
    if level ≥ a then [prev]
    else
      let half := prev.length / 2
      let next := (List.range half).map λ i =>
        let nodeAdrs := adrsSetType adrs FORS_TREE
        let nodeAdrs := adrsSetHashAddr nodeAdrs level
        let nodeAdrs := adrsSetChainAddr nodeAdrs i
        hashH ctx nodeAdrs prev[(2*i)]! prev[(2*i+1)]!
      prev :: go (level + 1) next
  go 0 skTree

/-- Compute all k FORS tree roots. -/
def forsRootsFromSk (ctx : HashCtx) (adrs : ByteArray)
                    (sk : List (List ByteArray)) (params : ForsParams) : List ByteArray :=
  (List.range params.k).map λ i =>
    let treeAdrs := adrsSetKpAddr adrs i
    let nodes := forsTreeHash ctx treeAdrs sk[i]! params.a
    let rootLevel := nodes[params.a]!
    rootLevel[0]!

/-- Hash all k roots into a single public key. -/
def forsPkFromRoots (ctx : HashCtx) (adrs : ByteArray)
                    (roots : List ByteArray) : ByteArray :=
  let pkAdrs := adrsSetType adrs FORS_ROOTS
  match roots with
  | [] => ByteArray.empty
  | r :: rs =>
    rs.foldl (λ pk r => hashH ctx pkAdrs pk r) r

/-- FORS public key from secret keys. -/
def forsPkFromSk (ctx : HashCtx) (adrs : ByteArray)
                 (sk : List (List ByteArray)) (params : ForsParams) : ByteArray :=
  let roots := forsRootsFromSk ctx adrs sk params
  forsPkFromRoots ctx adrs roots

/-- Convert message digest to FORS tree indices. -/
def msgToForsIndices (msgDigest : ByteArray) (params : ForsParams) : List Nat :=
  let logT := log2 params.t
  let indices := toBaseW msgDigest params.t logT params.k
  indices.map λ i => min i (params.t - 1)

/-- Standard FORS signing. -/
def forsSign (ctx : HashCtx) (params : ForsParams) (sk : List (List ByteArray))
             (adrs : ByteArray) (msgDigest : ByteArray) :
             List ByteArray × List (List ByteArray) :=
  let idxs := msgToForsIndices msgDigest params
  let sigVals := (List.range params.k).map λ i =>
    sk[i]![idxs[i]!]!
  let authPaths := (List.range params.k).map λ i =>
    let treeAdrs := adrsSetKpAddr adrs i
    let nodes := forsTreeHash ctx treeAdrs sk[i]! params.a
    let leafIdx := idxs[i]!
    let rec go (level : Nat) (idx : Nat) : List ByteArray :=
      if level ≥ params.a then []
      else
        let siblingIdx := (idx.xor 1)
        let sibling := nodes[level]![siblingIdx]!
        sibling :: go (level + 1) (idx / 2)
    go 0 leafIdx
  (sigVals, authPaths)

/-- Recover FORS tree roots from a signature. -/
def forsRootsFromSig (ctx : HashCtx) (adrs : ByteArray)
                     (sigVals : List ByteArray) (authPaths : List (List ByteArray))
                     (msgDigest : ByteArray) (params : ForsParams) : List ByteArray :=
  let idxs := msgToForsIndices msgDigest params
  (List.range params.k).map λ i =>
    let treeAdrs := adrsSetKpAddr adrs i
    let rec walkUp (level : Nat) (node : ByteArray) (idx : Nat) : ByteArray :=
      if level ≥ params.a then node
      else
        let sibling := authPaths[i]![level]!
        let nodeAdrs := adrsSetType treeAdrs FORS_TREE
        let nodeAdrs := adrsSetHashAddr nodeAdrs level
        let nodeAdrs := adrsSetChainAddr nodeAdrs (idx / 2)
        let nextNode :=
          if idx % 2 == 1 then
            hashH ctx nodeAdrs sibling node
          else
            hashH ctx nodeAdrs node sibling
        walkUp (level + 1) nextNode (idx / 2)
    walkUp 0 (sigVals[i]!) (idxs[i]!)

/-- FORS+C public key generation. -/
def forsCPk (ctx : HashCtx) (n : Nat) (skSeed : ByteArray) (adrs : ByteArray)
            (params : ForsParams) : ByteArray × ByteArray :=
  let sk := forsSkGen n skSeed adrs params
  let roots := forsRootsFromSk ctx adrs sk params
  let lastRoot := roots[params.k - 1]!
  let pk := forsPkFromRoots ctx adrs roots
  (lastRoot, pk)

/-- FORS+C signing with counter grinding. -/
partial def forsCSign (ctx : HashCtx) (n : Nat)
                      (skSeed : ByteArray) (adrs : ByteArray)
                      (msgDigest : ByteArray) (params : ForsParams)
                      (maxGrind : Nat := 1000000) :
                      ByteArray × List ByteArray × List (List ByteArray) :=
  let sk := forsSkGen n skSeed adrs params
  let rec grind (ctr : Nat) : ByteArray × List ByteArray × List (List ByteArray) :=
    if ctr ≥ maxGrind then
      (ByteArray.mk #[0,0,0,0],
       (List.range (params.k - 1)).map λ i => sk[i]![0]!,
       (List.range (params.k - 1)).map λ _ => List.replicate params.a ByteArray.empty)
    else
      let ctrBytes := ByteArray.mk #[
        ((ctr >>> 24) &&& 0xFF).toUInt8,
        ((ctr >>> 16) &&& 0xFF).toUInt8,
        ((ctr >>> 8) &&& 0xFF).toUInt8,
        (ctr &&& 0xFF).toUInt8
      ]
      let trialDigest := hashN ctx (ctrBytes ++ msgDigest)
      let idxs := msgToForsIndices trialDigest params
      if idxs[params.k - 1]! == 0 then
        let sigVals := (List.range (params.k - 1)).map λ i =>
          sk[i]![idxs[i]!]!
        let authPaths := (List.range (params.k - 1)).map λ i =>
          let treeAdrs := adrsSetKpAddr adrs i
          let nodes := forsTreeHash ctx treeAdrs sk[i]! params.a
          let leafIdx := idxs[i]!
          let rec go (level : Nat) (idx : Nat) : List ByteArray :=
            if level ≥ params.a then []
            else
              let siblingIdx := (idx.xor 1)
              let sibling := nodes[level]![siblingIdx]!
              sibling :: go (level + 1) (idx / 2)
          go 0 leafIdx
        (ctrBytes, sigVals, authPaths)
      else
        grind (ctr + 1)
  grind 0

/-- FORS+C verification. -/
def forsCVerify (ctx : HashCtx) (adrs : ByteArray)
                (ctr : ByteArray) (sigVals : List ByteArray)
                (authPaths : List (List ByteArray))
                (lastRoot : ByteArray) (pkFors : ByteArray)
                (msgDigest : ByteArray) (params : ForsParams) : Bool :=
  let trialDigest := hashN ctx (ctr ++ msgDigest)
  let idxs := msgToForsIndices trialDigest params
  if idxs[params.k - 1]! ≠ 0 then
    false
  else
    let roots' := (List.range (params.k - 1)).map λ i =>
      let treeAdrs := adrsSetKpAddr adrs i
      let rec walkUp (level : Nat) (node : ByteArray) (idx : Nat) : ByteArray :=
        if level ≥ params.a then node
        else
          let sibling := authPaths[i]![level]!
          let nodeAdrs := adrsSetType treeAdrs FORS_TREE
          let nodeAdrs := adrsSetHashAddr nodeAdrs level
          let nodeAdrs := adrsSetChainAddr nodeAdrs (idx / 2)
          let nextNode :=
            if idx % 2 == 1 then
              hashH ctx nodeAdrs sibling node
            else
              hashH ctx nodeAdrs node sibling
          walkUp (level + 1) nextNode (idx / 2)
      walkUp 0 (sigVals[i]!) (idxs[i]!)
    let roots := roots' ++ [lastRoot]
    let computedPk := forsPkFromRoots ctx adrs roots
    computedPk == pkFors

end SphincsMinus