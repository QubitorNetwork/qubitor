package mldsa65

import circlmldsa65 "github.com/cloudflare/circl/sign/mldsa/mldsa65"

const (
	// Address is the planned Qubitor native precompile address.
	Address = "0x0000000000000000000000000000000000000100"

	// Name is the protocol-visible precompile name.
	Name = "QBT_ML_DSA_65_VERIFY"
)

// Verify checks an ML-DSA-65 signature over message using the optional FIPS 204 context string.
func Verify(publicKey, message, context, signature []byte) bool {
	var pk circlmldsa65.PublicKey
	if err := pk.UnmarshalBinary(publicKey); err != nil {
		return false
	}
	return circlmldsa65.Verify(&pk, message, context, signature)
}

// Run executes the precompile ABI:
//
//   (bytes publicKey, bytes message, bytes context, bytes signature) -> (bool valid)
//
// This package intentionally does not depend on a concrete geth/CoreGeth precompile
// interface so it can be wired into the selected client fork with a thin adapter.
func Run(input []byte) ([]byte, error) {
	publicKey, message, context, signature, err := decodeFourBytesArgs(input)
	if err != nil {
		return encodeBool(false), nil
	}
	return encodeBool(Verify(publicKey, message, context, signature)), nil
}

