// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "./Test.sol";
import {AccountReadinessRegistry} from "../src/AccountReadinessRegistry.sol";
import {QubitorAdminVault} from "../src/QubitorAdminVault.sol";
import {QubitorAccount} from "../src/QubitorAccount.sol";
import {QubitorAccountFactory} from "../src/QubitorAccountFactory.sol";
import {QubitorTypes} from "../src/lib/QubitorTypes.sol";
import {SecurityModeRegistry} from "../src/SecurityModeRegistry.sol";

contract MockMLDSA65Verifier {
    fallback(bytes calldata input) external returns (bytes memory) {
        (
            bytes memory publicKey,
            bytes memory message,
            bytes memory context,
            bytes memory signature
        ) = abi.decode(input, (bytes, bytes, bytes, bytes));

        return abi.encode(
            keccak256(signature) == keccak256(abi.encodePacked(keccak256(abi.encode(publicKey, message, context))))
        );
    }
}

contract Receiver {
    event Received(address sender, uint256 value, bytes data);

    receive() external payable {
        emit Received(msg.sender, msg.value, "");
    }

    function ping() external payable returns (bytes4) {
        emit Received(msg.sender, msg.value, msg.data);
        return this.ping.selector;
    }
}

contract QubitorAccountTest is Test {
    address internal constant MLDSA65_PRECOMPILE = 0x0000000000000000000000000000000000000100;
    bytes internal constant PUBLIC_KEY = hex"010203040506070809";
    bytes internal constant NEXT_PUBLIC_KEY = hex"aabbccddeeff";

    SecurityModeRegistry internal securityModeRegistry;
    AccountReadinessRegistry internal readinessRegistry;
    QubitorAccountFactory internal factory;
    QubitorAccount internal account;
    QubitorAdminVault internal adminVault;
    Receiver internal receiver;

    function setUp() public {
        MockMLDSA65Verifier verifier = new MockMLDSA65Verifier();
        vm.etch(MLDSA65_PRECOMPILE, address(verifier).code);

        securityModeRegistry = new SecurityModeRegistry();
        readinessRegistry = new AccountReadinessRegistry();
        factory = new QubitorAccountFactory(address(securityModeRegistry), address(readinessRegistry));
        receiver = new Receiver();

        address predicted = factory.getAddress(bytes32("salt"), PUBLIC_KEY);
        address deployed = factory.createAccount(bytes32("salt"), PUBLIC_KEY);
        assertEq(deployed, predicted);

        account = QubitorAccount(payable(deployed));
        adminVault = new QubitorAdminVault(deployed);
        vm.deal(address(account), 10 ether);
        vm.deal(address(adminVault), 5 ether);
    }

    function testPQNativeMetadata() public {
        assertEq(uint256(account.securityMode()), uint256(QubitorTypes.SecurityMode.PQNative));
        assertEq(uint256(securityModeRegistry.accountMode(address(account))), uint256(QubitorTypes.SecurityMode.PQNative));

        (
            bool isQubitorAccount,
            QubitorTypes.SecurityMode mode,
            bytes32 pqPublicKeyCommitment,
            ,

        ) = readinessRegistry.accountReadiness(address(account));

        assertTrue(isQubitorAccount);
        assertEq(uint256(mode), uint256(QubitorTypes.SecurityMode.PQNative));
        assertEq(pqPublicKeyCommitment, keccak256(PUBLIC_KEY));
    }

    function testExecutePQTransfersValue() public {
        bytes memory data = abi.encodeCall(Receiver.ping, ());
        bytes memory message = account.executeMessage(0, address(receiver), 1 ether, data);
        bytes memory signature = signLikeMock(PUBLIC_KEY, message);

        bytes memory result = account.executePQ(address(receiver), 1 ether, data, 0, signature);
        bytes4 selector = abi.decode(result, (bytes4));

        assertTrue(selector == Receiver.ping.selector);
        assertEq(address(receiver).balance, 1 ether);
        assertEq(account.nonce(), 1);
    }

    function testReplayRejected() public {
        bytes memory data = "";
        bytes memory message = account.executeMessage(0, address(receiver), 1 ether, data);
        bytes memory signature = signLikeMock(PUBLIC_KEY, message);

        account.executePQ(address(receiver), 1 ether, data, 0, signature);

        vm.expectRevert(QubitorAccount.InvalidNonce.selector);
        account.executePQ(address(receiver), 1 ether, data, 0, signature);
    }

    function testInvalidPQSignatureRejected() public {
        bytes memory data = "";
        bytes memory badSignature = hex"deadbeef";

        vm.expectRevert(QubitorAccount.InvalidPQSignature.selector);
        account.executePQ(address(receiver), 1 ether, data, 0, badSignature);
    }

    function testRotatePQKeyRequiresCurrentPQAuthorization() public {
        bytes memory message = account.rotateMessage(0, NEXT_PUBLIC_KEY);
        bytes memory signature = signLikeMock(PUBLIC_KEY, message);

        account.rotatePQKey(NEXT_PUBLIC_KEY, 0, signature);

        assertEq(account.pqPublicKeyCommitment(), keccak256(NEXT_PUBLIC_KEY));
        assertEq(account.nonce(), 1);
    }

    function testLegacyOwnerFunctionDoesNotExist() public {
        (bool ok,) = address(account).call(abi.encodeWithSignature("rotateControlKey(address)", address(0xBEEF)));
        assertFalse(ok);
        assertEq(account.pqPublicKeyCommitment(), keccak256(PUBLIC_KEY));
    }

    function testPQAccountControlsAdminVaultTreasury() public {
        address payable recipient = payable(address(0xBEEF));
        bytes memory data = abi.encodeCall(QubitorAdminVault.transferTreasury, (recipient, 2 ether));
        bytes memory message = account.executeMessage(0, address(adminVault), 0, data);
        bytes memory signature = signLikeMock(PUBLIC_KEY, message);

        account.executePQ(address(adminVault), 0, data, 0, signature);

        assertEq(recipient.balance, 2 ether);
        assertEq(address(adminVault).balance, 3 ether);
        assertEq(account.nonce(), 1);
    }

    function testPQAccountControlsAdminVaultPolicy() public {
        bytes32 key = keccak256("faucet.maxDailyQbt");
        bytes32 value = bytes32(uint256(100 ether));
        bytes memory data = abi.encodeCall(QubitorAdminVault.recordPolicy, (key, value));
        bytes memory message = account.executeMessage(0, address(adminVault), 0, data);
        bytes memory signature = signLikeMock(PUBLIC_KEY, message);

        account.executePQ(address(adminVault), 0, data, 0, signature);

        assertEq(adminVault.policyValue(key), value);
        assertEq(adminVault.policyNonce(), 1);
        assertEq(account.nonce(), 1);
    }

    function testLegacyEOACannotControlAdminVault() public {
        vm.expectRevert(QubitorAdminVault.UnauthorizedPQController.selector);
        adminVault.recordPolicy(keccak256("faucet.maxDailyQbt"), bytes32(uint256(100 ether)));
    }

    function signLikeMock(bytes memory publicKey, bytes memory message) internal pure returns (bytes memory) {
        return abi.encodePacked(keccak256(abi.encode(publicKey, message, bytes("QUBITOR_ACCOUNT_V1"))));
    }
}
