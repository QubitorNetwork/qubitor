package mldsa65

import (
	"encoding/binary"
	"errors"
)

const abiWordSize = 32

var (
	errABIShortInput = errors.New("abi input too short")
	errABIOffset     = errors.New("abi offset out of bounds")
	errABILength     = errors.New("abi bytes length out of bounds")
)

func decodeFourBytesArgs(input []byte) (publicKey []byte, message []byte, context []byte, signature []byte, err error) {
	if len(input) < abiWordSize*4 {
		return nil, nil, nil, nil, errABIShortInput
	}

	publicKey, err = decodeBytesArg(input, 0)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	message, err = decodeBytesArg(input, abiWordSize)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	context, err = decodeBytesArg(input, abiWordSize*2)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	signature, err = decodeBytesArg(input, abiWordSize*3)
	if err != nil {
		return nil, nil, nil, nil, err
	}

	return publicKey, message, context, signature, nil
}

func decodeBytesArg(input []byte, headOffset int) ([]byte, error) {
	offset, err := readUint256AsInt(input[headOffset : headOffset+abiWordSize])
	if err != nil {
		return nil, err
	}
	if offset < abiWordSize*4 || offset+abiWordSize > len(input) {
		return nil, errABIOffset
	}

	length, err := readUint256AsInt(input[offset : offset+abiWordSize])
	if err != nil {
		return nil, err
	}
	dataStart := offset + abiWordSize
	dataEnd := dataStart + length
	if length < 0 || dataEnd < dataStart || dataEnd > len(input) {
		return nil, errABILength
	}

	out := make([]byte, length)
	copy(out, input[dataStart:dataEnd])
	return out, nil
}

func readUint256AsInt(word []byte) (int, error) {
	if len(word) != abiWordSize {
		return 0, errABIShortInput
	}
	for _, b := range word[:24] {
		if b != 0 {
			return 0, errABILength
		}
	}
	value := binary.BigEndian.Uint64(word[24:])
	if value > uint64(int(^uint(0)>>1)) {
		return 0, errABILength
	}
	return int(value), nil
}

func encodeBool(value bool) []byte {
	out := make([]byte, abiWordSize)
	if value {
		out[abiWordSize-1] = 1
	}
	return out
}

