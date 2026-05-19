#!/usr/bin/env python3
"""Verify the SPHINCS- test vector from test_vector.json."""

import json
from sphincs_minus import SphincsParams, sphincs_verify, int_to_bytes


def main():
    with open("test_vector.json") as f:
        tv = json.load(f)

    params = SphincsParams(**tv["params"])
    pk_seed = bytes.fromhex(tv["pk_seed"])
    pk_root = bytes.fromhex(tv["pk_root"])
    msg = bytes.fromhex(tv["msg_hex"])
    sig = (
        bytes.fromhex(tv["sig"]["R"]),
        int_to_bytes(tv["sig"]["counter"], 4),
        [bytes.fromhex(v) for v in tv["sig"]["fors_vals"]],
        [
            [bytes.fromhex(x) for x in auth]
            for auth in tv["sig"]["fors_auth"]
        ],
        [bytes.fromhex(x) for x in tv["sig"]["wots_sig"]],
        [bytes.fromhex(x) for x in tv["sig"]["auth_path"]],
    )
    fors_keys = [
        [
            (bytes.fromhex(lr), bytes.fromhex(pk))
            for lr, pk in tv["fors_keys"]
        ]
    ]

    ok = sphincs_verify(params, pk_seed, pk_root, msg, sig, fors_keys)
    if ok:
        print("Test vector VERIFIED OK")
        print(f"  n={params.n}, h={params.h}, d={params.d}, "
              f"a={params.a}, k={params.k}, w={params.w}")
        print(f"  PK root: {pk_root.hex()}")
        print(f"  Message: {msg.decode()}")
    else:
        print("Test vector VERIFICATION FAILED")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
