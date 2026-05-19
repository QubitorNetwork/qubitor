// Copyright 2026 The Qubitor Authors
// This file is part of the Qubitor Network CoreGeth fork.
//
// The go-ethereum library is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package types

import (
	"bytes"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/rlp"
)

const QubitorPQTxDefaultContext = "QUBITOR_PQ_TX_V1"

// QubitorPQTx is the first Qubitor-native transaction envelope.
//
// It does not contain secp256k1 signature values. Sender authorization is an
// ML-DSA-65 signature over the QubitorPQTx signing hash, and the sender is the
// Qubitor wallet/account address in Account.
type QubitorPQTx struct {
	ChainID     *big.Int
	Nonce       uint64
	GasTipCap   *big.Int
	GasFeeCap   *big.Int
	Gas         uint64
	Account     common.Address
	FactorySalt common.Hash
	To          *common.Address `rlp:"nil"`
	Value       *big.Int
	Data        []byte
	AccessList  AccessList

	PQPublicKey []byte
	PQContext   []byte
	PQSignature []byte
}

func (tx *QubitorPQTx) copy() TxData {
	cpy := &QubitorPQTx{
		Nonce:       tx.Nonce,
		Gas:         tx.Gas,
		Account:     tx.Account,
		FactorySalt: tx.FactorySalt,
		To:          copyAddressPtr(tx.To),
		Data:        common.CopyBytes(tx.Data),
		AccessList:  make(AccessList, len(tx.AccessList)),
		PQPublicKey: common.CopyBytes(tx.PQPublicKey),
		PQContext:   common.CopyBytes(tx.PQContext),
		PQSignature: common.CopyBytes(tx.PQSignature),
		ChainID:     new(big.Int),
		GasTipCap:   new(big.Int),
		GasFeeCap:   new(big.Int),
		Value:       new(big.Int),
	}
	copy(cpy.AccessList, tx.AccessList)
	if tx.ChainID != nil {
		cpy.ChainID.Set(tx.ChainID)
	}
	if tx.GasTipCap != nil {
		cpy.GasTipCap.Set(tx.GasTipCap)
	}
	if tx.GasFeeCap != nil {
		cpy.GasFeeCap.Set(tx.GasFeeCap)
	}
	if tx.Value != nil {
		cpy.Value.Set(tx.Value)
	}
	return cpy
}

func (tx *QubitorPQTx) txType() byte           { return QubitorPQTxType }
func (tx *QubitorPQTx) chainID() *big.Int      { return tx.ChainID }
func (tx *QubitorPQTx) accessList() AccessList { return tx.AccessList }
func (tx *QubitorPQTx) data() []byte           { return tx.Data }
func (tx *QubitorPQTx) gas() uint64            { return tx.Gas }
func (tx *QubitorPQTx) gasFeeCap() *big.Int    { return tx.GasFeeCap }
func (tx *QubitorPQTx) gasTipCap() *big.Int    { return tx.GasTipCap }
func (tx *QubitorPQTx) gasPrice() *big.Int     { return tx.GasFeeCap }
func (tx *QubitorPQTx) value() *big.Int        { return tx.Value }
func (tx *QubitorPQTx) nonce() uint64          { return tx.Nonce }
func (tx *QubitorPQTx) to() *common.Address    { return tx.To }

func (tx *QubitorPQTx) effectiveGasPrice(dst *big.Int, baseFee *big.Int) *big.Int {
	if baseFee == nil {
		return dst.Set(tx.GasFeeCap)
	}
	tip := dst.Sub(tx.GasFeeCap, baseFee)
	if tip.Cmp(tx.GasTipCap) > 0 {
		tip.Set(tx.GasTipCap)
	}
	return tip.Add(tip, baseFee)
}

func (tx *QubitorPQTx) rawSignatureValues() (v, r, s *big.Int) {
	return new(big.Int), new(big.Int), new(big.Int)
}

func (tx *QubitorPQTx) setSignatureValues(chainID, v, r, s *big.Int) {}

func (tx *QubitorPQTx) encode(b *bytes.Buffer) error {
	return rlp.Encode(b, tx)
}

func (tx *QubitorPQTx) decode(input []byte) error {
	return rlp.DecodeBytes(input, tx)
}

func (tx *QubitorPQTx) pqContext() []byte {
	if len(tx.PQContext) == 0 {
		return []byte(QubitorPQTxDefaultContext)
	}
	return tx.PQContext
}

func (tx *QubitorPQTx) signingHash() common.Hash {
	return prefixedRlpHash(
		QubitorPQTxType,
		[]interface{}{
			[]byte(QubitorPQTxDefaultContext),
			tx.ChainID,
			tx.Nonce,
			tx.GasTipCap,
			tx.GasFeeCap,
			tx.Gas,
			tx.Account,
			tx.FactorySalt,
			tx.To,
			tx.Value,
			tx.Data,
			tx.AccessList,
			tx.PQPublicKey,
			tx.pqContext(),
		},
	)
}
