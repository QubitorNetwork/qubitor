// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {QubitorAccount} from "./QubitorAccount.sol";

contract QubitorAccountFactory {
    address public immutable securityModeRegistry;
    address public immutable accountReadinessRegistry;

    event AccountCreated(address indexed account, bytes32 indexed pqPublicKeyCommitment, bytes32 salt);

    constructor(address initialSecurityModeRegistry, address initialAccountReadinessRegistry) {
        securityModeRegistry = initialSecurityModeRegistry;
        accountReadinessRegistry = initialAccountReadinessRegistry;
    }

    function createAccount(bytes32 salt, bytes calldata pqPublicKey) external returns (address account) {
        account = getAddress(salt, pqPublicKey);
        if (account.code.length != 0) return account;

        QubitorAccount deployed = new QubitorAccount{salt: salt}(
            pqPublicKey,
            securityModeRegistry,
            accountReadinessRegistry
        );
        account = address(deployed);

        emit AccountCreated(account, keccak256(pqPublicKey), salt);
    }

    function getAddress(bytes32 salt, bytes calldata pqPublicKey) public view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(QubitorAccount).creationCode,
            abi.encode(pqPublicKey, securityModeRegistry, accountReadinessRegistry)
        );

        bytes32 digest = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode))
        );

        return address(uint160(uint256(digest)));
    }
}

