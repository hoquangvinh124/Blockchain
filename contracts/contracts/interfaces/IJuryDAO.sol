// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Minimal interface cua JuryDAO ma PhygitalEscrow can goi.
interface IJuryDAO {
    function openCase(
        uint256 listingId,
        address buyer,
        address seller,
        address challenger,
        uint256 disputeFeeAmount,
        bytes32 evidenceHash,
        string calldata evidenceURI
    ) external payable returns (uint256 caseId);

    function jurorPoolSize() external view returns (uint256);
}
