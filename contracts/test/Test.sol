// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface Vm {
    function deal(address account, uint256 newBalance) external;
    function etch(address target, bytes calldata newRuntimeBytecode) external;
    function expectRevert(bytes4 revertData) external;
}

contract Test {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertTrue(bool value) internal pure {
        require(value, "assertTrue failed");
    }

    function assertFalse(bool value) internal pure {
        require(!value, "assertFalse failed");
    }

    function assertEq(address actual, address expected) internal pure {
        require(actual == expected, "assertEq(address) failed");
    }

    function assertEq(uint256 actual, uint256 expected) internal pure {
        require(actual == expected, "assertEq(uint256) failed");
    }

    function assertEq(bytes32 actual, bytes32 expected) internal pure {
        require(actual == expected, "assertEq(bytes32) failed");
    }

    function assertEq(bytes4 actual, bytes4 expected) internal pure {
        require(actual == expected, "assertEq(bytes4) failed");
    }
}

