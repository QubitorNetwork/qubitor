#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SPHINCS_DIR="$ROOT_DIR/third_party/sphincsminus"

fail() {
  echo "[qubitor-sphincs-minus] $*" >&2
  exit 1
}

command -v python3 >/dev/null 2>&1 || fail "python3 is required"
[[ -f "$SPHINCS_DIR/sphincs_minus.py" ]] || fail "missing vendored sphincs_minus.py"
[[ -f "$SPHINCS_DIR/verify_test_vector.py" ]] || fail "missing vendored verify_test_vector.py"
[[ -f "$SPHINCS_DIR/UPSTREAM-QUBITOR.md" ]] || fail "missing Qubitor upstream provenance file"

(
  cd "$SPHINCS_DIR"
  python3 sphincs_minus.py test
  python3 verify_test_vector.py
  python3 - <<'PY'
from sphincs_minus import SphincsParams

def sizes(params):
    h_prime = params.h_prime
    public_key_bytes = 24 + params.n + params.n + (1 << h_prime) * 2 * params.n
    raw_signature_bytes = (
        params.n
        + 4
        + (params.k - 1) * params.n
        + (params.k - 1) * params.a * params.n
        + params.wots_l * params.n
        + h_prime * params.n
    )
    serialized_signature_bytes = (
        params.n
        + 4
        + 4
        + (params.k - 1) * (4 + params.n)
        + 4
        + (params.k - 1) * (4 + params.a * (4 + params.n))
        + 4
        + params.wots_l * (4 + params.n)
        + 4
        + h_prime * (4 + params.n)
    )
    return public_key_bytes, raw_signature_bytes, serialized_signature_bytes

test_params = SphincsParams(n=16, h=4, d=2, a=3, k=3, w=16)
c7_params = SphincsParams(n=16, h=24, d=2, a=16, k=8, w=8)
test_pk, test_raw_sig, test_sig = sizes(test_params)
c7_pk, c7_raw_sig, c7_sig = sizes(c7_params)

assert test_sig == 944, test_sig
assert c7_pk == 131128, c7_pk
assert 3500 <= c7_sig <= 3800, c7_sig

print("SPHINCS- size profile:")
print(f"  test public key: {test_pk} bytes")
print(f"  test signature:  {test_sig} bytes serialized ({test_raw_sig} bytes raw)")
print(f"  C7 public key:   {c7_pk} bytes")
print(f"  C7 signature:    {c7_sig} bytes serialized ({c7_raw_sig} bytes raw)")
PY
)

echo "[qubitor-sphincs-minus] ok"
