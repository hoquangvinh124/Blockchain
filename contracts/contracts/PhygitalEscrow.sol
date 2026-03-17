// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import "./interfaces/IMarketCollection.sol";
import "./interfaces/IJuryDAO.sol";
import "./libraries/MarketTypes.sol";

/**
 * PhygitalEscrow — escrow lifecycle cho Phygital token tren TrustMarket V2.
 *
 * Flow: createListing (tu MarketCollection) -> buy -> redeem (lock NFT + shipping info hash)
 * -> confirmShipped -> passive settlement (timeout) hoac dispute.
 *
 * Passive settlement: buyer khong can confirm delivery. Sau khi disputeDeadline qua
 * ma buyer khong raise dispute, seller co the settle de nhan tien.
 *
 * Neu seller khong ship trong shippingDeadline: buyer duoc refund + seller mat collateral.
 */
contract PhygitalEscrow is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuard,
    PausableUpgradeable,
    UUPSUpgradeable
{
    IMarketCollection public collection;
    IJuryDAO public juryDAO;

    uint256 public nextListingId;
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => uint256) public listingByToken; // tokenId -> listingId

    // Seller dang ky public key de buyer ma hoa thong tin giao hang
    mapping(address => string) public sellerEncryptionPubkeys;

    uint256 public accumulatedFees;
    uint256 public platformFeeBps;   // 2% = 200
    uint256 public collateralBps;    // 50% = 5000
    uint256 public disputeFeeBps;    // 5% = 500
    uint256 public shippingPeriod;   // 14 days
    uint256 public disputePeriod;    // 14 days

    // ─── Errors ───────────────────────────────────────────────────────────────

    error OnlyCollection();
    error OnlyJuryDAO();
    error NotSeller(uint256 listingId);
    error NotRedeemer(uint256 listingId);
    error SelfPurchase();
    error WrongStatus(ListingStatus current);
    error IncorrectPayment(uint256 required, uint256 sent);
    error InvalidPrice();
    error InvalidAddress();
    error InvalidRedeemWindow();
    error InvalidEvidence();
    error RedeemWindowNotOpen();
    error RedeemWindowExpired(uint256 redeemEnd);
    error ShippingDeadlineNotPassed(uint256 deadline);
    error DisputeDeadlineNotPassed(uint256 deadline);
    error DisputeDeadlineExpired(uint256 deadline);
    error InsufficientFees(uint256 requested, uint256 available);
    error FeeTooHigh();
    error TransferFailed();
    error NotParticipant(uint256 listingId);
    error NotTokenHolder(uint256 tokenId);

    // ─── Events ───────────────────────────────────────────────────────────────

    event ListingCreated(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed seller,
        uint256 price,
        uint256 collateral,
        uint256 redeemStart,
        uint256 redeemEnd
    );
    event ItemPurchased(uint256 indexed listingId, address indexed buyer);
    event ItemRedeemed(uint256 indexed listingId, address indexed redeemer, bytes32 shippingInfoHash, string shippingInfoURI);
    event ShippingConfirmed(uint256 indexed listingId, string shippingProofURI);
    event ShippingExpired(uint256 indexed listingId, uint256 buyerRefund);
    event ListingSettled(uint256 indexed listingId, uint256 sellerPayout);
    event DisputeOpened(
        uint256 indexed listingId,
        address indexed challenger,
        uint256 feeAmount,
        bytes32 evidenceHash,
        string evidenceURI
    );
    event VerdictExecuted(uint256 indexed listingId, bool buyerWins);
    event ListingExpired(uint256 indexed listingId, uint256 sellerPayout);
    event ListingCancelled(uint256 indexed listingId);
    event EncryptionPubkeyPublished(address indexed seller, string pubkey);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event PlatformFeeBpsUpdated(uint256 newBps);
    event CollateralBpsUpdated(uint256 newBps);
    event DisputeFeeBpsUpdated(uint256 newBps);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlySeller(uint256 listingId) {
        if (msg.sender != listings[listingId].seller) revert NotSeller(listingId);
        _;
    }

    modifier onlyRedeemer(uint256 listingId) {
        if (msg.sender != listings[listingId].redeemer) revert NotRedeemer(listingId);
        _;
    }

    modifier onlyJuryDAOContract() {
        if (msg.sender != address(juryDAO)) revert OnlyJuryDAO();
        _;
    }

    modifier onlyCollectionContract() {
        if (msg.sender != address(collection)) revert OnlyCollection();
        _;
    }

    modifier inStatus(uint256 listingId, ListingStatus required) {
        if (listings[listingId].status != required) {
            revert WrongStatus(listings[listingId].status);
        }
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ─── Initializer ──────────────────────────────────────────────────────────

    function initialize(
        address _collection,
        address _juryDAO,
        address initialOwner
    ) external initializer {
        __Ownable_init(initialOwner);
        __Pausable_init();

        if (_collection == address(0) || _juryDAO == address(0)) revert InvalidAddress();

        collection = IMarketCollection(_collection);
        juryDAO = IJuryDAO(_juryDAO);
        platformFeeBps = 200;    // 2%
        collateralBps = 5_000;   // 50%
        disputeFeeBps = 500;     // 5%
        shippingPeriod = 14 days;
        disputePeriod = 14 days;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setPlatformFeeBps(uint256 bps) external onlyOwner {
        if (bps > 500) revert FeeTooHigh();
        platformFeeBps = bps;
        emit PlatformFeeBpsUpdated(bps);
    }

    function setCollateralBps(uint256 bps) external onlyOwner {
        collateralBps = bps;
        emit CollateralBpsUpdated(bps);
    }

    function setDisputeFeeBps(uint256 bps) external onlyOwner {
        if (bps > 2_000) revert FeeTooHigh();
        disputeFeeBps = bps;
        emit DisputeFeeBpsUpdated(bps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdrawFees(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        if (amount > accumulatedFees) revert InsufficientFees(amount, accumulatedFees);
        accumulatedFees -= amount;
        _sendEth(to, amount);
        emit FeesWithdrawn(to, amount);
    }

    // Seller dang ky NaCl X25519 public key de buyer ma hoa shipping info.
    function publishEncryptionPubkey(string calldata pubkey) external {
        if (bytes(pubkey).length == 0) revert InvalidEvidence();
        sellerEncryptionPubkeys[msg.sender] = pubkey;
        emit EncryptionPubkeyPublished(msg.sender, pubkey);
    }

    // Goi boi MarketCollection de dang ky pubkey cua seller trong cung 1 TX mint.
    function setSellerPubkeyByCollection(address seller, string calldata pubkey)
        external
        onlyCollectionContract
    {
        if (bytes(pubkey).length == 0) return;
        sellerEncryptionPubkeys[seller] = pubkey;
        emit EncryptionPubkeyPublished(seller, pubkey);
    }

    // ─── Listing Lifecycle ────────────────────────────────────────────────────

    // Goi boi MarketCollection.mintPhygital, nhan collateral tu seller.
    function createListing(
        uint256 tokenId,
        address payable seller,
        uint256 price,
        uint256 redeemStart,
        uint256 redeemEnd
    ) external payable onlyCollectionContract whenNotPaused returns (uint256 listingId) {
        if (price == 0) revert InvalidPrice();
        if (redeemEnd <= redeemStart) revert InvalidRedeemWindow();

        uint256 collateral = calcCollateral(price);
        if (msg.value != collateral) revert IncorrectPayment(collateral, msg.value);

        listingId = nextListingId++;

        listings[listingId] = Listing({
            id: listingId,
            tokenId: tokenId,
            seller: seller,
            buyer: payable(address(0)),
            redeemer: payable(address(0)),
            challenger: payable(address(0)),
            price: price,
            collateral: collateral,
            shippingInfoHash: bytes32(0),
            shippingInfoURI: "",
            shippingProofURI: "",
            listedAt: block.timestamp,
            soldAt: 0,
            redeemedAt: 0,
            shippedAt: 0,
            shippingDeadline: 0,
            disputeDeadline: 0,
            disputeOpenedAt: 0,
            disputeFeeAmount: 0,
            disputeEvidenceHash: bytes32(0),
            disputeEvidenceURI: "",
            status: ListingStatus.ACTIVE
        });

        listingByToken[tokenId] = listingId;

        emit ListingCreated(listingId, tokenId, seller, price, collateral, redeemStart, redeemEnd);
    }

    // Seller huy listing truoc khi co buyer. Tra collateral ve seller, burn token.
    function cancelListing(uint256 listingId)
        external
        onlySeller(listingId)
        inStatus(listingId, ListingStatus.ACTIVE)
        nonReentrant
    {
        Listing storage listing = listings[listingId];
        listing.status = ListingStatus.CANCELLED;

        uint256 refund = listing.collateral;
        listing.collateral = 0;

        collection.burnToken(listing.tokenId);
        _sendEth(listing.seller, refund);

        emit ListingCancelled(listingId);
    }

    // Buyer mua Phygital token. Gui ETH = price.
    function buyItem(uint256 listingId)
        external
        payable
        nonReentrant
        whenNotPaused
        inStatus(listingId, ListingStatus.ACTIVE)
    {
        Listing storage listing = listings[listingId];
        if (msg.sender == listing.seller) revert SelfPurchase();
        if (msg.value != listing.price) revert IncorrectPayment(listing.price, msg.value);

        listing.buyer = payable(msg.sender);
        listing.soldAt = block.timestamp;
        listing.status = ListingStatus.SOLD;

        // Transfer NFT tu seller sang buyer
        collection.escrowTransfer(listing.tokenId, listing.seller, msg.sender);

        emit ItemPurchased(listingId, msg.sender);
    }

    // Holder redeem Phygital token de doi hang that.
    // Token bi lock (khong burn). Buyer gui shipping info hash + IPFS URI.
    function redeemItem(
        uint256 listingId,
        bytes32 shippingInfoHash,
        string calldata shippingInfoURI
    ) external nonReentrant inStatus(listingId, ListingStatus.SOLD) {
        if (shippingInfoHash == bytes32(0)) revert InvalidEvidence();

        Listing storage listing = listings[listingId];
        TokenInfo memory tokenInfo = collection.getTokenInfo(listing.tokenId);

        // Kiem tra redeem window
        if (block.timestamp < tokenInfo.redeemStart) revert RedeemWindowNotOpen();
        if (block.timestamp > tokenInfo.redeemEnd) revert RedeemWindowExpired(tokenInfo.redeemEnd);

        // Chi owner hien tai cua token moi duoc redeem
        if (collection.ownerOf(listing.tokenId) != msg.sender) revert NotTokenHolder(listing.tokenId);

        listing.redeemer = payable(msg.sender);
        listing.redeemedAt = block.timestamp;
        listing.shippingInfoHash = shippingInfoHash;
        listing.shippingInfoURI = shippingInfoURI;
        listing.shippingDeadline = block.timestamp + shippingPeriod;
        listing.status = ListingStatus.REDEEMED;

        // Lock token (khong burn) — burn chi khi hoan tat
        collection.lockToken(listing.tokenId);

        emit ItemRedeemed(listingId, msg.sender, shippingInfoHash, shippingInfoURI);
    }

    // Seller xac nhan da gui hang + luu minh chung (tracking + proof IPFS URI).
    function confirmShipped(uint256 listingId, string calldata shippingProofURI)
        external
        onlySeller(listingId)
        inStatus(listingId, ListingStatus.REDEEMED)
    {
        Listing storage listing = listings[listingId];
        listing.shippedAt = block.timestamp;
        listing.disputeDeadline = block.timestamp + disputePeriod;
        listing.shippingProofURI = shippingProofURI;
        listing.status = ListingStatus.SHIPPED;

        emit ShippingConfirmed(listingId, shippingProofURI);
    }

    // Passive settlement: ai cung co the goi sau khi disputeDeadline qua.
    // Buyer khong can confirm delivery — neu khong dispute thi coi nhu hoan tat.
    function settle(uint256 listingId)
        external
        nonReentrant
        inStatus(listingId, ListingStatus.SHIPPED)
    {
        Listing storage listing = listings[listingId];
        if (block.timestamp <= listing.disputeDeadline) {
            revert DisputeDeadlineNotPassed(listing.disputeDeadline);
        }

        listing.status = ListingStatus.COMPLETED;

        // Burn token vinh vien
        collection.burnToken(listing.tokenId);

        uint256 payout = _releaseFundsToSeller(listing);

        emit ListingSettled(listingId, payout);
    }

    // Seller khong ship trong shippingDeadline: buyer refund + seller mat collateral.
    function expireShipping(uint256 listingId)
        external
        nonReentrant
        inStatus(listingId, ListingStatus.REDEEMED)
    {
        Listing storage listing = listings[listingId];
        if (block.timestamp <= listing.shippingDeadline) {
            revert ShippingDeadlineNotPassed(listing.shippingDeadline);
        }

        listing.status = ListingStatus.REFUNDED;

        uint256 price = listing.price;
        uint256 collateral = listing.collateral;
        listing.price = 0;
        listing.collateral = 0;

        // Buyer duoc refund toan bo price + collateral cua seller
        uint256 buyerRefund = price + collateral;

        // Unlock token — tra ve buyer (redeemer)
        collection.unlockToken(listing.tokenId);

        _sendEth(listing.redeemer, buyerRefund);

        emit ShippingExpired(listingId, buyerRefund);
    }

    // Buyer raise dispute (chi trong trang thai REDEEMED hoac SHIPPED).
    function raiseDispute(
        uint256 listingId,
        bytes32 evidenceHash,
        string calldata evidenceURI
    ) external payable nonReentrant {
        if (evidenceHash == bytes32(0) || bytes(evidenceURI).length == 0) revert InvalidEvidence();

        Listing storage listing = listings[listingId];

        // Cho phep dispute o REDEEMED (seller chua ship) hoac SHIPPED (trong dispute window)
        if (listing.status == ListingStatus.SHIPPED) {
            if (block.timestamp > listing.disputeDeadline) {
                revert DisputeDeadlineExpired(listing.disputeDeadline);
            }
        } else if (listing.status != ListingStatus.REDEEMED) {
            revert WrongStatus(listing.status);
        }

        if (msg.sender != listing.redeemer) revert NotParticipant(listingId);

        uint256 requiredFee = calcDisputeFee(listing.price);
        if (msg.value != requiredFee) revert IncorrectPayment(requiredFee, msg.value);

        listing.challenger = payable(msg.sender);
        listing.disputeOpenedAt = block.timestamp;
        listing.disputeFeeAmount = msg.value;
        listing.disputeEvidenceHash = evidenceHash;
        listing.disputeEvidenceURI = evidenceURI;
        listing.status = ListingStatus.DISPUTED;

        emit DisputeOpened(listingId, msg.sender, msg.value, evidenceHash, evidenceURI);

        // Forward dispute fee den JuryDAO de tao case
        juryDAO.openCase{value: msg.value}(
            listingId,
            listing.redeemer,
            listing.seller,
            msg.sender,
            msg.value,
            evidenceHash,
            evidenceURI
        );
    }

    // JuryDAO callback sau khi finalize verdict.
    function executeVerdict(uint256 listingId, bool buyerWins)
        external
        onlyJuryDAOContract
        nonReentrant
        inStatus(listingId, ListingStatus.DISPUTED)
    {
        Listing storage listing = listings[listingId];

        uint256 price = listing.price;
        uint256 collateral = listing.collateral;
        uint256 disputeFeeAmount = listing.disputeFeeAmount;

        listing.price = 0;
        listing.collateral = 0;
        listing.disputeFeeAmount = 0;

        if (buyerWins) {
            listing.status = ListingStatus.REFUNDED;

            uint256 buyerGets = price;
            uint256 sellerGets = collateral;

            // Buyer thang: hoan dispute fee tu collateral cua seller
            if (sellerGets >= disputeFeeAmount) {
                sellerGets -= disputeFeeAmount;
                buyerGets += disputeFeeAmount;
            } else {
                buyerGets += sellerGets;
                sellerGets = 0;
            }

            // Unlock token tra ve buyer
            collection.unlockToken(listing.tokenId);

            _sendEth(listing.redeemer, buyerGets);
            if (sellerGets > 0) {
                _sendEth(listing.seller, sellerGets);
            }
        } else {
            listing.status = ListingStatus.COMPLETED;

            uint256 fee = (price * platformFeeBps) / 10_000;
            uint256 sellerGets = price - fee + collateral;
            accumulatedFees += fee;

            // Seller thang: burn token, seller nhan price - fee + collateral
            // Dispute fee da o JuryDAO, khong track o day (fix V1 bug)
            collection.burnToken(listing.tokenId);
            _sendEth(listing.seller, sellerGets);
        }

        emit VerdictExecuted(listingId, buyerWins);
    }

    // Het han redeem ma khong ai redeem. Seller nhan price + collateral - fee.
    function expireRedeem(uint256 listingId)
        external
        nonReentrant
        inStatus(listingId, ListingStatus.SOLD)
    {
        Listing storage listing = listings[listingId];
        TokenInfo memory tokenInfo = collection.getTokenInfo(listing.tokenId);

        if (block.timestamp <= tokenInfo.redeemEnd) {
            revert RedeemWindowExpired(tokenInfo.redeemEnd);
        }

        listing.status = ListingStatus.EXPIRED;

        uint256 price = listing.price;
        uint256 collateral = listing.collateral;
        listing.price = 0;
        listing.collateral = 0;

        uint256 fee = (price * platformFeeBps) / 10_000;
        uint256 sellerPayout = price - fee + collateral;
        accumulatedFees += fee;

        collection.burnToken(listing.tokenId);
        _sendEth(listing.seller, sellerPayout);

        emit ListingExpired(listingId, sellerPayout);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }

    function getListingCount() external view returns (uint256) {
        return nextListingId;
    }

    function calcCollateral(uint256 price) public view returns (uint256) {
        return (price * collateralBps) / 10_000;
    }

    function calcDisputeFee(uint256 price) public view returns (uint256) {
        return (price * disputeFeeBps) / 10_000;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _releaseFundsToSeller(Listing storage listing) internal returns (uint256 payout) {
        uint256 price = listing.price;
        uint256 collateral = listing.collateral;
        uint256 fee = (price * platformFeeBps) / 10_000;

        payout = price - fee + collateral;
        accumulatedFees += fee;

        listing.price = 0;
        listing.collateral = 0;

        _sendEth(listing.seller, payout);
    }

    function _sendEth(address payable to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // 9 own vars -> gap = 50 - 9 = 41
    uint256[41] private __gap;

    receive() external payable {}
}
