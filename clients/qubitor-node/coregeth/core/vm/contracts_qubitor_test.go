package vm

import (
	"bytes"
	"crypto/rand"
	"encoding/binary"
	"math/big"
	"testing"

	"github.com/cloudflare/circl/sign/mldsa/mldsa65"
	"github.com/ethereum/go-ethereum/params/types/coregeth"
)

func TestQubitorMLDSA65PrecompileValidAndInvalid(t *testing.T) {
	pk, sk, err := mldsa65.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}

	message := []byte("qubitor executePQ")
	context := []byte("QUBITOR_ACCOUNT_V1")
	signature := make([]byte, mldsa65.SignatureSize)
	if err := mldsa65.SignTo(sk, message, context, false, signature); err != nil {
		t.Fatalf("SignTo: %v", err)
	}

	precompile := &qbtMLDSA65Verify{}
	out, err := precompile.Run(encodeQbtFourBytesArgs(pk.Bytes(), message, context, signature))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !bytes.Equal(out, encodeQbtBool(true)) {
		t.Fatalf("expected valid signature, got %x", out)
	}

	signature[0] ^= 0x01
	out, err = precompile.Run(encodeQbtFourBytesArgs(pk.Bytes(), message, context, signature))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !bytes.Equal(out, encodeQbtBool(false)) {
		t.Fatalf("expected invalid signature, got %x", out)
	}
}

func TestQubitorPrecompileOnlyActiveOnQubitorChain(t *testing.T) {
	devnet := &coregeth.CoreGethChainConfig{ChainID: big.NewInt(QubitorDevnetChainID)}
	testnet := &coregeth.CoreGethChainConfig{ChainID: big.NewInt(QubitorTestnetChainID)}
	mainnet := &coregeth.CoreGethChainConfig{ChainID: big.NewInt(QubitorMainnetChainID)}
	other := &coregeth.CoreGethChainConfig{ChainID: big.NewInt(61)}

	for name, config := range map[string]*coregeth.CoreGethChainConfig{
		"devnet":  devnet,
		"testnet": testnet,
		"mainnet": mainnet,
	} {
		if PrecompiledContractsForConfig(config, big.NewInt(0), nil)[QubitorMLDSA65PrecompileAddress] == nil {
			t.Fatalf("expected Qubitor ML-DSA precompile on Qubitor %s", name)
		}
	}
	if PrecompiledContractsForConfig(other, big.NewInt(0), nil)[QubitorMLDSA65PrecompileAddress] != nil {
		t.Fatal("did not expect Qubitor ML-DSA precompile on non-Qubitor chain")
	}
}

func TestQubitorMLDSA65PrecompileMalformedInputReturnsFalse(t *testing.T) {
	precompile := &qbtMLDSA65Verify{}
	out, err := precompile.Run([]byte("bad"))
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !bytes.Equal(out, encodeQbtBool(false)) {
		t.Fatalf("expected false for malformed input, got %x", out)
	}
}

func encodeQbtFourBytesArgs(args ...[]byte) []byte {
	head := make([]byte, qbtABIWordSize*len(args))
	tail := make([]byte, 0)
	for i, arg := range args {
		writeQbtUint256(head[i*qbtABIWordSize:(i+1)*qbtABIWordSize], qbtABIWordSize*len(args)+len(tail))
		tail = append(tail, encodeQbtBytes(arg)...)
	}
	return append(head, tail...)
}

func encodeQbtBytes(value []byte) []byte {
	paddedLen := ((len(value) + qbtABIWordSize - 1) / qbtABIWordSize) * qbtABIWordSize
	out := make([]byte, qbtABIWordSize+paddedLen)
	writeQbtUint256(out[:qbtABIWordSize], len(value))
	copy(out[qbtABIWordSize:], value)
	return out
}

func writeQbtUint256(word []byte, value int) {
	binary.BigEndian.PutUint64(word[24:], uint64(value))
}
