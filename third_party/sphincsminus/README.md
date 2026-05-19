# SPHINCS- 

A minimal post-quantum stateless hash-based signature scheme optimized for
EVM-friendly deployment. Uses KECCAK256-compatible SHA3-256, FORS+C
(counter-based pruning), WOTS+C (checksum grinding), and a d=2 hypertree.

## Quick start (Python)

```bash
# Generate keys
$ python sphincs_minus.py keygen
Private key: 0xafaa19c3...
Public key:  0x1000000004...

# Derive public key
$ python sphincs_minus.py privtopub 0x<privkey>
0x1000000004...

# Sign a message
$ python sphincs_minus.py sign 0x<privkey> "hello world" /tmp/sig.bin
Signature written to /tmp/sig.bin (944 bytes)

# Verify
$ python sphincs_minus.py verify 0x<pubkey> "hello world" /tmp/sig.bin
VERIFIED

# Wrong message
$ python sphincs_minus.py verify 0x<pubkey> "wrong" /tmp/sig.bin
INVALID

# Run all component tests
$ python sphincs_minus.py test
```

## Quick start (Lean)

```bash
$ lake build Examples.SphincsMinus.CLI
```

Then from within Lean:

```lean
import Examples.SphincsMinus.CLI
open SphincsMinus

-- Derive public key from private key hex
#eval privtopub "0xafaa19..."

-- Hex parsing/encoding utilities
#eval parseHex "0xdeadbeef"          -- ByteArray
#eval toHex (ByteArray.mk #[1,2,3])  -- "0x010203"
```

## API reference

### Python

| Function | Signature | Description |
|----------|-----------|-------------|
| `sphincs_keygen(params, sk_seed_in=None, sk_prf_in=None)` | `→ (sk_seed, sk_prf, pk_seed, pk_root, fors_keys)` | Generate keypair |
| `sphincs_sign(params, sk_seed, sk_prf, pk_seed, pk_root, msg, fors_keys, leaf_usage=0)` | `→ (R, counter, fors_vals, fors_auth, wots_sig, auth_path)` | Sign message |
| `sphincs_verify(params, pk_seed, pk_root, msg, sig, fors_keys, leaf_usage=0)` | `→ bool` | Verify signature |
| `pack_privkey(sk_seed, sk_prf)` | `→ bytes` | Pack 32-byte private key |
| `pack_pubkey(params, pk_seed, pk_root, fors_keys)` | `→ bytes` | Pack public key (binary) |
| `sphincs_cli_sign(privkey_hex, message, sig_file)` | `→ bytes` | CLI wrapper |
| `sphincs_cli_verify(pubkey_hex, message, sig_file)` | `→ bool` | CLI wrapper |
| `sphincs_cli_privtopub(privkey_hex)` | `→ str` | CLI wrapper |

### Lean

| Function | Signature | Description |
|----------|-----------|-------------|
| `sphincsKeygen (params) (skSeedIn? skPrfIn?)` | `→ ByteArray × … × List (ByteArray × ByteArray)` | Keygen |
| `sphincsSign params skSeed skPrf pkSeed pkRoot msg forsKeys (leafUsage?)` | `→ ByteArray × … × List ByteArray` | Sign |
| `sphincsVerify params pkSeed pkRoot msg sig forsKeys (leafUsage?)` | `→ Bool` | Verify |
| `parseHex s` | `String → ByteArray` | Parse "0x"-prefixed hex |
| `toHex ba` | `ByteArray → String` | Encode as "0x"-prefixed hex |
| `packPrivkey skSeed skPrf` | `ByteArray → ByteArray → ByteArray` | 32-byte key |
| `packPubkey params pkSeed pkRoot forsKeys` | `→ ByteArray` | Binary public key |
| `privtopub privkeyHex` | `String → String` | Derive pubkey |

## Parameters

| Name | Test | C7 (production) | Description |
|------|------|-----------------|-------------|
| n | 16 | 16 | Hash output bytes |
| h | 4 | 24 | Total hypertree height |
| d | 2 | 2 | Number of layers |
| a | 3 | 16 | FORS tree height |
| k | 3 | 8 | Number of FORS trees |
| w | 16 | 8 | Winternitz parameter |

Test params produce 944-byte signatures. C7 produces ~3,704-byte signatures.

## Key formats

### Private key (32 bytes)
```
sk_seed || sk_prf
```
Both `n` bytes each (test: 16+16=32 bytes). Encoded as `0x`-prefixed hex.

### Public key (binary, self-describing)
```
[24-byte header] || pk_seed || pk_root || fors_last_root_0 || fors_pk_0 || ...
```
Header: 6 × uint32 LE (n, h, d, a, k, w). Each FORS entry: `last_root || pk_fors` (`2n` bytes each).

### Signature (binary, length-prefixed)
```
R || counter(4) || len(fors_vals) || [len(v) || v]... || len(fors_auth) || ...
```

## Architecture

```
SPHINCS- (d=2 hypertree)
├── Top layer (height h-h')
│   └── XMSS: WOTS+ PKs as leaves, Merkle tree
│       └── WOTS+: 35 chains, base-16 digits
│           └── SHA3-256 truncated to n bytes
└── Bottom layer (height h')
    ├── XMSS: WOTS+ PKs as leaves
    │   └── WOTS+ signs (last_root || pk_fors)
    └── FORS+C: k trees of height a
        └── Counter grinding: prune last tree, store root in PK
            └── FORS secret keys from PRF(sk_seed, ADRS)
```

## Files

| File | Language | Status | Description |
|------|----------|--------|-------------|
| `sphincs_minus.py` | Python | ✅ Complete | Reference implementation + CLI |
| `verify_test_vector.py` | Python | ✅ | Test vector verifier |
| `test_vector.json` | JSON | ✅ | Gold test vector |
| `Hash.lean` | Lean 4 | ✅ | SHA3-256 FFI, ADRS, hash functions |
| `WOTS.lean` | Lean 4 | ✅ | WOTS+, chain iteration, ADRS manipulation |
| `FORS.lean` | Lean 4 | ✅ | FORS, FORS+C, counter grinding |
| `Scheme.lean` | Lean 4 | ✅ | SPHINCS keygen, sign, verify |
| `CLI.lean` | Lean 4 | ✅ | Hex parse/encode, privtopub |
| `Test.lean` | Lean 4 | 🔧 Skeleton | Test harness for future use |

## Building

```bash
# Full project build
lake build

# Individual modules
lake build Examples.SphincsMinus.Hash
lake build Examples.SphincsMinus.WOTS
lake build Examples.SphincsMinus.FORS
lake build Examples.SphincsMinus.Scheme
lake build Examples.SphincsMinus.CLI

# Python tests
python sphincs_minus.py test
python verify_test_vector.py
```

## Dependencies

- **Python**: `hashlib`, `struct`, `typing` (stdlib only)
- **Lean 4**: `FFI.Hashing` (SHA3-256 via C FFI), `Examples.SphincsMinus.*`

## License

Apache 2.0
# sphincsminus
