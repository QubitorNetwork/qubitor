package types

import (
	"encoding/binary"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

var (
	qubitorSystemSecurityModeRegistry     = common.HexToAddress(qubitorSystemSecurityModeRegistryHex)
	qubitorSystemAccountReadinessRegistry = common.HexToAddress(qubitorSystemAccountReadinessRegistryHex)
	qubitorSystemAccountFactory           = common.HexToAddress(qubitorSystemAccountFactoryHex)
	qubitorAccountCreationCode            = common.FromHex(qubitorAccountCreationCodeHex)
)

func qubitorAccountCreate2Address(publicKey []byte, factorySalt common.Hash) common.Address {
	initCode := qubitorAccountInitCode(publicKey)
	initCodeHash := crypto.Keccak256Hash(initCode)
	digest := crypto.Keccak256Hash(
		[]byte{0xff},
		qubitorSystemAccountFactory.Bytes(),
		factorySalt.Bytes(),
		initCodeHash.Bytes(),
	)
	return common.BytesToAddress(digest[12:])
}

func qubitorAccountInitCode(publicKey []byte) []byte {
	paddedPublicKeyLength := (len(publicKey) + 31) &^ 31
	constructorLength := 32*4 + paddedPublicKeyLength
	initCode := make([]byte, 0, len(qubitorAccountCreationCode)+constructorLength)
	initCode = append(initCode, qubitorAccountCreationCode...)

	args := make([]byte, constructorLength)
	qubitorPutUint256Word(args[0:32], 32*3)
	copy(args[32+12:64], qubitorSystemSecurityModeRegistry.Bytes())
	copy(args[64+12:96], qubitorSystemAccountReadinessRegistry.Bytes())
	qubitorPutUint256Word(args[96:128], uint64(len(publicKey)))
	copy(args[128:], publicKey)

	return append(initCode, args...)
}

func qubitorPutUint256Word(dst []byte, value uint64) {
	binary.BigEndian.PutUint64(dst[24:32], value)
}
