// Copyright 2026 The Qubitor Authors
// This file is part of the Qubitor Network CoreGeth fork.

package core

import (
	"errors"
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/rawdb"
	"github.com/ethereum/go-ethereum/core/state"
	"github.com/ethereum/go-ethereum/core/vm"
	"github.com/ethereum/go-ethereum/params/types/goethereum"
	"github.com/holiman/uint256"
)

func TestQubitorPQMessageAllowsContractSender(t *testing.T) {
	account := common.HexToAddress("0x1234567890123456789012345678901234567890")
	target := common.HexToAddress("0x000000000000000000000000000000000000dEaD")

	if err := precheckContractSender(account, target, false); !errors.Is(err, ErrSenderNoEOA) {
		t.Fatalf("expected ErrSenderNoEOA without Qubitor allowance, got %v", err)
	}
	if err := precheckContractSender(account, target, true); err != nil {
		t.Fatalf("expected Qubitor PQ message to allow contract sender, got %v", err)
	}
}

func precheckContractSender(account common.Address, target common.Address, allowContractSender bool) error {
	statedb, _ := state.New(common.Hash{}, state.NewDatabase(rawdb.NewMemoryDatabase()), nil)
	statedb.SetNonce(account, 1)
	statedb.SetCode(account, []byte{0x60, 0x00})
	statedb.SetBalance(account, uint256.NewInt(1_000_000_000))

	msg := &Message{
		From:                account,
		To:                  &target,
		Nonce:               1,
		Value:               big.NewInt(0),
		GasLimit:            21_000,
		GasPrice:            big.NewInt(1),
		GasFeeCap:           big.NewInt(1),
		GasTipCap:           big.NewInt(1),
		AllowContractSender: allowContractSender,
	}
	evm := vm.NewEVM(
		vm.BlockContext{
			CanTransfer: CanTransfer,
			Transfer:    Transfer,
			BlockNumber: big.NewInt(0),
			Time:        0,
			BaseFee:     big.NewInt(0),
		},
		vm.TxContext{},
		statedb,
		&goethereum.ChainConfig{ChainID: big.NewInt(91337)},
		vm.Config{},
	)

	return NewStateTransition(evm, msg, new(GasPool).AddGas(1_000_000)).preCheck()
}
