// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {QubitorTypes} from "./lib/QubitorTypes.sol";

contract SecurityModeRegistry {
    mapping(address account => QubitorTypes.SecurityMode mode) public accountMode;

    event SecurityModeRecorded(address indexed account, QubitorTypes.SecurityMode mode);

    function recordMode(address account, QubitorTypes.SecurityMode mode) external {
        require(account != address(0), "SecurityModeRegistry: account required");
        require(msg.sender == account, "SecurityModeRegistry: only account");
        accountMode[account] = mode;
        emit SecurityModeRecorded(account, mode);
    }

    function label(QubitorTypes.SecurityMode mode) external pure returns (string memory) {
        if (mode == QubitorTypes.SecurityMode.Legacy) return "Legacy";
        if (mode == QubitorTypes.SecurityMode.SmartAccountReady) return "Smart Account Ready";
        if (mode == QubitorTypes.SecurityMode.HybridProtected) return "Hybrid Protected";
        if (mode == QubitorTypes.SecurityMode.PQReady) return "PQ Ready";
        return "PQ Native";
    }
}

