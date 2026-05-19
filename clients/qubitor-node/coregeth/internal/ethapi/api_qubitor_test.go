// Copyright 2026 The Qubitor Authors
// This file is part of the Qubitor Network CoreGeth fork.

package ethapi

import (
	"context"
	"errors"
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

func TestQubitorSendRawPQTransactionRejectsLegacyEnvelope(t *testing.T) {
	legacy := types.NewTransaction(
		0,
		common.HexToAddress("0x000000000000000000000000000000000000dEaD"),
		big.NewInt(1),
		21_000,
		big.NewInt(1),
		nil,
	)
	input, err := legacy.MarshalBinary()
	if err != nil {
		t.Fatalf("MarshalBinary: %v", err)
	}

	_, err = NewQubitorTransactionAPI(nil).SendRawPQTransaction(context.Background(), input)
	if !errors.Is(err, types.ErrTxTypeNotSupported) {
		t.Fatalf("expected ErrTxTypeNotSupported, got %v", err)
	}
}

func TestSendRawTransactionRejectsLegacyEnvelopeWhenEOATxsDisabled(t *testing.T) {
	t.Setenv("QUBITOR_EOA_TXS", "0")
	legacy := types.NewTransaction(
		0,
		common.HexToAddress("0x000000000000000000000000000000000000dEaD"),
		big.NewInt(1),
		21_000,
		big.NewInt(1),
		nil,
	)
	input, err := legacy.MarshalBinary()
	if err != nil {
		t.Fatalf("MarshalBinary: %v", err)
	}

	_, err = (&TransactionAPI{}).SendRawTransaction(context.Background(), input)
	if !errors.Is(err, types.ErrTxTypeNotSupported) {
		t.Fatalf("expected ErrTxTypeNotSupported, got %v", err)
	}
}
