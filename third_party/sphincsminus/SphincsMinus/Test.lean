/-
Copyright (c) 2026 Vitalik Buterin. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
Authors: Vitalik Buterin
-/
import SphincsMinus.CLI
import SphincsMinus.Scheme

/-!
# SPHINCS- Tests

Use `#eval runKeygenTest` and `#eval runSignTest` in your editor.
Use `lake build Examples.SphincsMinus.Test` to verify compilation.
-/

open SphincsMinus

/-- Keygen round-trip test: generate keys, derive pubkey from privkey. -/
def runKeygenTest : IO Unit := do
  let params := defaultParams
  let (skSeed, skPrf, pkSeed, pkRoot, forsKeys) := sphincsKeygen params
  let privkey := packPrivkey skSeed skPrf
  let pubkey := packPubkey params pkSeed pkRoot forsKeys
  let pkDerived := privtopub (toHex privkey)
  if toHex pubkey == pkDerived then
    IO.println "PASS: keygen → privtopub round-trip"
  else
    IO.println "FAIL: keygen → privtopub mismatch"
  IO.println s!"Private key: {toHex privkey}"
  IO.println s!"Public key:  {toHex pubkey}"
  IO.println s!"FORS pairs: {forsKeys.length}"
  IO.println s!"pkRoot:     {toHex pkRoot}"
  IO.println s!"pkSeed:     {toHex pkSeed}"

/-- Sign/verify round-trip test. -/
def runSignTest : IO Unit := do
  let params := defaultParams
  let (skSeed, skPrf, pkSeed, pkRoot, forsKeys) := sphincsKeygen params
  let msgStr := "hello world"
  let msg : ByteArray :=
    ByteArray.mk (List.toArray (msgStr.toList.map λ c => (c.toNat).toUInt8))
  let (R, counter, forsVals, forsAuth, wotsSig, authPath) :=
    sphincsSign params skSeed skPrf pkSeed pkRoot msg forsKeys
  let sig := (R, counter, forsVals, forsAuth, wotsSig, authPath)
  let ok := sphincsVerify params pkSeed pkRoot msg sig forsKeys
  if ok then
    IO.println "PASS: sign → verify round-trip"
  else
    IO.println "FAIL: signature verification failed"
  IO.println s!"R:          {toHex R}"
  IO.println s!"counter:    {toHex counter}"
  IO.println s!"fors_vals:  {forsVals.length} trees"
  IO.println s!"fors_auth:  {forsAuth.length} subtrees"
  IO.println s!"wots_sig:   {wotsSig.length} chains"
  IO.println s!"auth_path:  {authPath.length} nodes"

/-- Run both tests. -/
def runTests : IO Unit := do
  runKeygenTest
  IO.println ""
  runSignTest
