// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract QubitorAdminVault {
    address public immutable pqController;
    uint256 public policyNonce;

    mapping(bytes32 key => bytes32 value) public policyValue;

    event TreasuryReceived(address indexed sender, uint256 value);
    event TreasuryTransferred(address indexed controller, address indexed target, uint256 value);
    event PolicyRecorded(address indexed controller, bytes32 indexed key, bytes32 value, uint256 nonce);

    error InvalidPQController();
    error InvalidTarget();
    error UnauthorizedPQController();
    error TreasuryTransferFailed(bytes result);

    constructor(address initialPQController) payable {
        if (initialPQController == address(0)) revert InvalidPQController();
        pqController = initialPQController;
    }

    receive() external payable {
        emit TreasuryReceived(msg.sender, msg.value);
    }

    modifier onlyPQController() {
        if (msg.sender != pqController) revert UnauthorizedPQController();
        _;
    }

    function transferTreasury(address payable target, uint256 value) external onlyPQController {
        if (target == address(0)) revert InvalidTarget();

        (bool success, bytes memory result) = target.call{value: value}("");
        if (!success) revert TreasuryTransferFailed(result);

        emit TreasuryTransferred(msg.sender, target, value);
    }

    function recordPolicy(bytes32 key, bytes32 value) external onlyPQController returns (uint256 nonce) {
        nonce = policyNonce;
        policyNonce++;
        policyValue[key] = value;

        emit PolicyRecorded(msg.sender, key, value, nonce);
    }
}
