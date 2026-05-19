// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {QubitorTypes} from "./lib/QubitorTypes.sol";

contract AccountReadinessRegistry {
    struct Readiness {
        bool isQubitorAccount;
        QubitorTypes.SecurityMode securityMode;
        bytes32 pqPublicKeyCommitment;
        uint256 lastKeyRotation;
        uint256 updatedAt;
    }

    mapping(address account => Readiness readiness) public accountReadiness;

    event ReadinessRecorded(
        address indexed account,
        QubitorTypes.SecurityMode securityMode,
        bytes32 pqPublicKeyCommitment,
        uint256 lastKeyRotation
    );

    function recordPQNative(bytes32 pqPublicKeyCommitment, uint256 lastKeyRotation) external {
        accountReadiness[msg.sender] = Readiness({
            isQubitorAccount: true,
            securityMode: QubitorTypes.SecurityMode.PQNative,
            pqPublicKeyCommitment: pqPublicKeyCommitment,
            lastKeyRotation: lastKeyRotation,
            updatedAt: block.timestamp
        });

        emit ReadinessRecorded(
            msg.sender,
            QubitorTypes.SecurityMode.PQNative,
            pqPublicKeyCommitment,
            lastKeyRotation
        );
    }
}

