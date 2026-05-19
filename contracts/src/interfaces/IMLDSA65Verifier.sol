// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMLDSA65Verifier {
    function verify(
        bytes calldata publicKey,
        bytes calldata message,
        bytes calldata context,
        bytes calldata signature
    ) external view returns (bool valid);
}

