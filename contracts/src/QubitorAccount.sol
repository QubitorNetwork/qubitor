// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccountReadinessRegistry} from "./AccountReadinessRegistry.sol";
import {SecurityModeRegistry} from "./SecurityModeRegistry.sol";
import {QubitorTypes} from "./lib/QubitorTypes.sol";

contract QubitorAccount {
    bytes4 internal constant EIP1271_MAGIC_VALUE = 0x1626ba7e;
    bytes4 internal constant EIP1271_INVALID_VALUE = 0xffffffff;

    address public constant MLDSA65_PRECOMPILE = 0x0000000000000000000000000000000000000100;
    bytes public constant MLDSA_CONTEXT = "QUBITOR_ACCOUNT_V1";

    bytes32 internal constant EXECUTE_DOMAIN =
        keccak256("QubitorAccount.executePQ(uint256 chainId,address account,uint256 nonce,address target,uint256 value,bytes32 dataHash)");
    bytes32 internal constant ROTATE_DOMAIN =
        keccak256("QubitorAccount.rotatePQKey(uint256 chainId,address account,uint256 nonce,bytes32 newPublicKeyHash)");

    address public immutable factory;
    address public immutable securityModeRegistry;
    address public immutable accountReadinessRegistry;

    bytes public pqPublicKey;
    uint256 public nonce;
    uint256 public lastKeyRotation;
    QubitorTypes.SecurityMode public securityMode;

    event ExecutedPQ(address indexed target, uint256 value, bytes data, uint256 nonce);
    event PQKeyRotated(bytes32 indexed previousPublicKeyCommitment, bytes32 indexed newPublicKeyCommitment, uint256 nonce);

    error InvalidNonce();
    error InvalidPQSignature();
    error InvalidTarget();
    error ExecutionFailed(bytes result);
    error PublicKeyRequired();

    constructor(
        bytes memory initialPQPublicKey,
        address initialSecurityModeRegistry,
        address initialAccountReadinessRegistry
    ) {
        if (initialPQPublicKey.length == 0) revert PublicKeyRequired();

        factory = msg.sender;
        pqPublicKey = initialPQPublicKey;
        securityModeRegistry = initialSecurityModeRegistry;
        accountReadinessRegistry = initialAccountReadinessRegistry;
        securityMode = QubitorTypes.SecurityMode.PQNative;
        lastKeyRotation = block.timestamp;

        _recordReadiness();
    }

    receive() external payable {}

    function executePQ(
        address target,
        uint256 value,
        bytes calldata data,
        uint256 expectedNonce,
        bytes calldata signature
    ) external returns (bytes memory result) {
        if (target == address(0)) revert InvalidTarget();
        if (expectedNonce != nonce) revert InvalidNonce();

        bytes memory message = executeMessage(expectedNonce, target, value, data);
        if (!_verifyPQ(pqPublicKey, message, signature)) revert InvalidPQSignature();

        nonce++;
        (bool success, bytes memory callResult) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed(callResult);

        emit ExecutedPQ(target, value, data, expectedNonce);
        return callResult;
    }

    function rotatePQKey(
        bytes calldata newPQPublicKey,
        uint256 expectedNonce,
        bytes calldata signature
    ) external {
        if (newPQPublicKey.length == 0) revert PublicKeyRequired();
        if (expectedNonce != nonce) revert InvalidNonce();

        bytes memory message = rotateMessage(expectedNonce, newPQPublicKey);
        if (!_verifyPQ(pqPublicKey, message, signature)) revert InvalidPQSignature();

        bytes32 previousCommitment = pqPublicKeyCommitment();
        pqPublicKey = newPQPublicKey;
        nonce++;
        lastKeyRotation = block.timestamp;
        _recordReadiness();

        emit PQKeyRotated(previousCommitment, pqPublicKeyCommitment(), expectedNonce);
    }

    function executeMessage(
        uint256 expectedNonce,
        address target,
        uint256 value,
        bytes calldata data
    ) public view returns (bytes memory) {
        return abi.encodePacked(
            EXECUTE_DOMAIN,
            block.chainid,
            address(this),
            expectedNonce,
            target,
            value,
            keccak256(data)
        );
    }

    function rotateMessage(uint256 expectedNonce, bytes calldata newPQPublicKey) public view returns (bytes memory) {
        return abi.encodePacked(
            ROTATE_DOMAIN,
            block.chainid,
            address(this),
            expectedNonce,
            keccak256(newPQPublicKey)
        );
    }

    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        return _verifyPQ(pqPublicKey, abi.encodePacked(digest), signature)
            ? EIP1271_MAGIC_VALUE
            : EIP1271_INVALID_VALUE;
    }

    function pqPublicKeyCommitment() public view returns (bytes32) {
        return keccak256(pqPublicKey);
    }

    function _verifyPQ(
        bytes memory publicKey,
        bytes memory message,
        bytes calldata signature
    ) internal view returns (bool) {
        (bool ok, bytes memory result) = MLDSA65_PRECOMPILE.staticcall(
            abi.encode(publicKey, message, MLDSA_CONTEXT, signature)
        );
        return ok && result.length >= 32 && abi.decode(result, (bool));
    }

    function _recordReadiness() internal {
        if (securityModeRegistry != address(0)) {
            try SecurityModeRegistry(securityModeRegistry).recordMode(address(this), QubitorTypes.SecurityMode.PQNative) {}
            catch {}
        }

        if (accountReadinessRegistry != address(0)) {
            try AccountReadinessRegistry(accountReadinessRegistry).recordPQNative(pqPublicKeyCommitment(), lastKeyRotation) {}
            catch {}
        }
    }
}

