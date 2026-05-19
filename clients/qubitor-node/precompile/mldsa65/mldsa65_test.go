package mldsa65

import (
	"bytes"
	"crypto/rand"
	"encoding/binary"
	"testing"

	circlmldsa65 "github.com/cloudflare/circl/sign/mldsa/mldsa65"
)

func TestVerifyValidAndInvalidSignatures(t *testing.T) {
	pk, sk, err := circlmldsa65.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}

	message := []byte("qubitor pq account authorization")
	context := []byte("QUBITOR_ACCOUNT_V1")
	signature := make([]byte, circlmldsa65.SignatureSize)
	if err := circlmldsa65.SignTo(sk, message, context, false, signature); err != nil {
		t.Fatalf("SignTo: %v", err)
	}

	if !Verify(pk.Bytes(), message, context, signature) {
		t.Fatal("expected valid signature")
	}

	signature[0] ^= 0x01
	if Verify(pk.Bytes(), message, context, signature) {
		t.Fatal("expected tampered signature to fail")
	}
}

func TestRunABIRoundTrip(t *testing.T) {
	pk, sk, err := circlmldsa65.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}

	message := []byte("executePQ")
	context := []byte("QUBITOR_ACCOUNT_V1")
	signature := make([]byte, circlmldsa65.SignatureSize)
	if err := circlmldsa65.SignTo(sk, message, context, false, signature); err != nil {
		t.Fatalf("SignTo: %v", err)
	}

	out, err := Run(encodeFourBytesArgs(pk.Bytes(), message, context, signature))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !bytes.Equal(out, encodeBool(true)) {
		t.Fatalf("expected true ABI bool, got %x", out)
	}
}

func TestRunMalformedInputReturnsFalse(t *testing.T) {
	out, err := Run([]byte("bad"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !bytes.Equal(out, encodeBool(false)) {
		t.Fatalf("expected false ABI bool, got %x", out)
	}
}

func encodeFourBytesArgs(args ...[]byte) []byte {
	head := make([]byte, abiWordSize*len(args))
	tail := make([]byte, 0)
	for i, arg := range args {
		writeUint256(head[i*abiWordSize:(i+1)*abiWordSize], abiWordSize*len(args)+len(tail))
		tail = append(tail, encodeBytes(arg)...)
	}
	return append(head, tail...)
}

func encodeBytes(value []byte) []byte {
	paddedLen := ((len(value) + abiWordSize - 1) / abiWordSize) * abiWordSize
	out := make([]byte, abiWordSize+paddedLen)
	writeUint256(out[:abiWordSize], len(value))
	copy(out[abiWordSize:], value)
	return out
}

func writeUint256(word []byte, value int) {
	binary.BigEndian.PutUint64(word[24:], uint64(value))
}

