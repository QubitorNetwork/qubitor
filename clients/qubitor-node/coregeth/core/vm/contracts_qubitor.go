// Copyright 2026 The Qubitor Authors
// This file is part of the Qubitor Network CoreGeth fork.
//
// The go-ethereum library is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package vm

import (
	"encoding/binary"
	"errors"
	"math/big"

	"github.com/cloudflare/circl/sign/mldsa/mldsa65"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/params/types/ctypes"
)

const (
	// QubitorDevnetChainID is the local Qubitor devnet chain ID.
	QubitorDevnetChainID = 91337

	// QubitorTestnetChainID is the public-testnet launch candidate chain ID.
	QubitorTestnetChainID = 91338

	// QubitorMainnetChainID is reserved for the future Qubitor mainnet.
	QubitorMainnetChainID = 91339

	// QubitorMLDSA65VerifyGas is the initial fixed gas cost for one ML-DSA-65 verification.
	//
	// This is intentionally conservative for the first public-testnet path. Before mainnet,
	// benchmark the verifier on target node hardware and replace this with a documented gas model.
	QubitorMLDSA65VerifyGas uint64 = 250000

	qbtABIWordSize = 32
)

// QubitorMLDSA65PrecompileAddress is the reserved address for QBT_ML_DSA_65_VERIFY.
var QubitorMLDSA65PrecompileAddress = common.HexToAddress("0x0000000000000000000000000000000000000100")

var (
	errQbtABIShortInput = errors.New("qubitor mldsa65: abi input too short")
	errQbtABIOffset     = errors.New("qubitor mldsa65: abi offset out of bounds")
	errQbtABILength     = errors.New("qubitor mldsa65: abi bytes length out of bounds")
)

// IsQubitorChain returns true when Qubitor-specific precompiles should be active.
func IsQubitorChain(config ctypes.ChainConfigurator) bool {
	chainID := config.GetChainID()
	if chainID == nil {
		return false
	}
	return chainID.Cmp(big.NewInt(QubitorDevnetChainID)) == 0 ||
		chainID.Cmp(big.NewInt(QubitorTestnetChainID)) == 0 ||
		chainID.Cmp(big.NewInt(QubitorMainnetChainID)) == 0
}

// qbtMLDSA65Verify implements QBT_ML_DSA_65_VERIFY.
//
// Input is raw ABI data, with no function selector:
//
//	abi.encode(bytes publicKey, bytes message, bytes context, bytes signature)
//
// Output is:
//
//	abi.encode(bool valid)
type qbtMLDSA65Verify struct{}

func (c *qbtMLDSA65Verify) RequiredGas(input []byte) uint64 {
	return QubitorMLDSA65VerifyGas
}

func (c *qbtMLDSA65Verify) Run(input []byte) ([]byte, error) {
	publicKey, message, context, signature, err := decodeQbtMLDSA65Input(input)
	if err != nil {
		return encodeQbtBool(false), nil
	}

	var pk mldsa65.PublicKey
	if err := pk.UnmarshalBinary(publicKey); err != nil {
		return encodeQbtBool(false), nil
	}

	return encodeQbtBool(mldsa65.Verify(&pk, message, context, signature)), nil
}

func decodeQbtMLDSA65Input(input []byte) (publicKey []byte, message []byte, context []byte, signature []byte, err error) {
	if len(input) < qbtABIWordSize*4 {
		return nil, nil, nil, nil, errQbtABIShortInput
	}

	publicKey, err = decodeQbtBytesArg(input, 0)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	message, err = decodeQbtBytesArg(input, qbtABIWordSize)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	context, err = decodeQbtBytesArg(input, qbtABIWordSize*2)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	signature, err = decodeQbtBytesArg(input, qbtABIWordSize*3)
	if err != nil {
		return nil, nil, nil, nil, err
	}

	return publicKey, message, context, signature, nil
}

func decodeQbtBytesArg(input []byte, headOffset int) ([]byte, error) {
	offset, err := readQbtUint256AsInt(input[headOffset : headOffset+qbtABIWordSize])
	if err != nil {
		return nil, err
	}
	if offset < qbtABIWordSize*4 || offset+qbtABIWordSize > len(input) {
		return nil, errQbtABIOffset
	}

	length, err := readQbtUint256AsInt(input[offset : offset+qbtABIWordSize])
	if err != nil {
		return nil, err
	}
	dataStart := offset + qbtABIWordSize
	dataEnd := dataStart + length
	if length < 0 || dataEnd < dataStart || dataEnd > len(input) {
		return nil, errQbtABILength
	}

	out := make([]byte, length)
	copy(out, input[dataStart:dataEnd])
	return out, nil
}

func readQbtUint256AsInt(word []byte) (int, error) {
	if len(word) != qbtABIWordSize {
		return 0, errQbtABIShortInput
	}
	for _, b := range word[:24] {
		if b != 0 {
			return 0, errQbtABILength
		}
	}
	value := binary.BigEndian.Uint64(word[24:])
	if value > uint64(int(^uint(0)>>1)) {
		return 0, errQbtABILength
	}
	return int(value), nil
}

func encodeQbtBool(value bool) []byte {
	out := make([]byte, qbtABIWordSize)
	if value {
		out[qbtABIWordSize-1] = 1
	}
	return out
}
