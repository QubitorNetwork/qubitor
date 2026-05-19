// Copyright 2026 The Qubitor Authors
// This file is part of the Qubitor Network CoreGeth fork.

package txpool

import (
	"errors"
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core"
	"github.com/ethereum/go-ethereum/core/types"
)

func TestQubitorEOATxsDisabledRejectsLegacyPoolTransaction(t *testing.T) {
	t.Setenv("QUBITOR_EOA_TXS", "0")
	tx := types.NewTransaction(
		0,
		common.HexToAddress("0x000000000000000000000000000000000000dEaD"),
		big.NewInt(1),
		21_000,
		big.NewInt(1),
		nil,
	)
	err := ValidateTransaction(tx, &types.Header{GasLimit: 30_000_000}, nil, &ValidationOptions{
		Accept:  1<<types.LegacyTxType | 1<<types.AccessListTxType | 1<<types.DynamicFeeTxType | 1<<types.QubitorPQTxType,
		MaxSize: 128 * 1024,
		MinTip:  big.NewInt(0),
	})
	if !errors.Is(err, core.ErrTxTypeNotSupported) {
		t.Fatalf("expected ErrTxTypeNotSupported, got %v", err)
	}
}
