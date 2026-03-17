// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../libraries/MarketTypes.sol";

// Minimal interface cho MarketCollection ma PhygitalEscrow can goi.
interface IMarketCollection {
    function lockToken(uint256 tokenId) external;
    function burnToken(uint256 tokenId) external;
    function unlockToken(uint256 tokenId) external;
    function escrowTransfer(uint256 tokenId, address from, address to) external;
    function ownerOf(uint256 tokenId) external view returns (address);
    function getTokenInfo(uint256 tokenId) external view returns (TokenInfo memory);
}
