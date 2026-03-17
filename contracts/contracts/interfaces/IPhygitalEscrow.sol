// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Minimal interface cho PhygitalEscrow ma JuryDAO va MarketCollection can goi.
interface IPhygitalEscrow {
    function createListing(
        uint256 tokenId,
        address payable seller,
        uint256 price,
        uint256 redeemStart,
        uint256 redeemEnd
    ) external payable returns (uint256 listingId);

    function executeVerdict(uint256 listingId, bool buyerWins) external;
    function calcCollateral(uint256 price) external view returns (uint256);
    function setSellerPubkeyByCollection(address seller, string calldata pubkey) external;
}
