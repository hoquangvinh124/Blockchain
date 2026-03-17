// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import "./interfaces/IPhygitalEscrow.sol";
import "./libraries/MarketTypes.sol";

/**
 * MarketCollection — shared ERC1155 cho TrustMarket V2.
 *
 * Moi token co supply=1 (hanh vi NFT). Seller tao Set (collection) roi mint token vao Set.
 * Ho tro 2 loai token:
 * - NORMAL: collectible, co the list/buy ngay tren contract nay
 * - PHYGITAL: NFT dai dien hang vat ly, mint -> tao listing tren PhygitalEscrow
 *
 * On-chain traits (max 20), per-token URI, owner tracking qua _tokenOwner mapping.
 * Transfer restrictions enforce qua _update override.
 */
contract MarketCollection is
    Initializable,
    ERC1155Upgradeable,
    ERC1155SupplyUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    // ─── Roles ────────────────────────────────────────────────────────────────

    // PhygitalEscrow duoc grant role nay de lock/burn/transfer token.
    bytes32 public constant ESCROW_ROLE = keccak256("ESCROW_ROLE");

    // ─── Storage ──────────────────────────────────────────────────────────────

    uint256 public nextSetId;
    uint256 public nextTokenId;

    mapping(uint256 => Set) public sets;
    mapping(uint256 => TokenInfo) public tokens;
    mapping(uint256 => string) private _tokenURIs;
    mapping(uint256 => Trait[]) private _tokenTraits;
    mapping(uint256 => address) private _tokenOwner;

    IPhygitalEscrow public phygitalEscrow;

    // Normal marketplace: listing cua token NORMAL dang LISTED.
    uint256 public nextNormalListingId;
    mapping(uint256 => NormalListing) public normalListings;
    mapping(uint256 => uint256) public normalListingByToken;  // tokenId -> listingId

    // Fee cho Normal marketplace.
    uint256 public normalFeeBps;

    uint256 public accumulatedNormalFees;

    // ─── Normal Listing Struct ────────────────────────────────────────────────

    struct NormalListing {
        uint256 id;
        uint256 tokenId;
        address payable seller;
        uint256 price;
        bool active;
    }

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant MAX_TRAITS = 20;

    // ─── Errors ───────────────────────────────────────────────────────────────

    error InvalidAddress();
    error InvalidURI();
    error InvalidPrice();
    error NotSetCreator(uint256 setId);
    error SetNotFound(uint256 setId);
    error TokenNotFound(uint256 tokenId);
    error NotTokenOwner(uint256 tokenId);
    error TooManyTraits(uint256 count);
    error WrongTokenState(TokenState current);
    error WrongTokenType(TokenType current);
    error InvalidRedeemWindow();
    error SelfPurchase();
    error IncorrectPayment(uint256 required, uint256 sent);
    error ListingNotActive(uint256 listingId);
    error TransferRestricted(uint256 tokenId);
    error TransferFailed();
    error InsufficientFees(uint256 requested, uint256 available);

    // ─── Events ───────────────────────────────────────────────────────────────

    event SetCreated(uint256 indexed setId, address indexed creator, string metadataURI);
    event TokenMinted(
        uint256 indexed tokenId,
        uint256 indexed setId,
        address indexed creator,
        TokenType tokenType,
        uint256 price
    );
    event TraitsSet(uint256 indexed tokenId, uint256 traitCount);
    event NormalTokenListed(uint256 indexed listingId, uint256 indexed tokenId, address indexed seller, uint256 price);
    event NormalTokenSold(uint256 indexed listingId, uint256 indexed tokenId, address indexed buyer, uint256 price);
    event NormalListingCancelled(uint256 indexed listingId, uint256 indexed tokenId);
    event PhygitalEscrowSet(address indexed escrow);
    event NormalFeesWithdrawn(address indexed to, uint256 amount);
    event SetMetadataUpdated(uint256 indexed setId, string metadataURI);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ─── Initializer ──────────────────────────────────────────────────────────

    function initialize(address admin) external initializer {
        __ERC1155_init("");
        __ERC1155Supply_init();
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        normalFeeBps = 200; // 2%
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setPhygitalEscrow(address _escrow) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_escrow == address(0)) revert InvalidAddress();
        phygitalEscrow = IPhygitalEscrow(_escrow);
        emit PhygitalEscrowSet(_escrow);
    }

    function setNormalFeeBps(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        normalFeeBps = bps;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function withdrawNormalFees(address payable to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert InvalidAddress();
        if (amount > accumulatedNormalFees) revert InsufficientFees(amount, accumulatedNormalFees);
        accumulatedNormalFees -= amount;
        _sendEth(to, amount);
        emit NormalFeesWithdrawn(to, amount);
    }

    // ─── Set Management ───────────────────────────────────────────────────────

    // Bat ky ai cung co the tao Set (collection).
    function createSet(string calldata metadataURI) external whenNotPaused returns (uint256 setId) {
        if (bytes(metadataURI).length == 0) revert InvalidURI();

        setId = nextSetId++;
        sets[setId] = Set({
            id: setId,
            creator: msg.sender,
            metadataURI: metadataURI,
            tokenCount: 0,
            createdAt: block.timestamp
        });

        emit SetCreated(setId, msg.sender, metadataURI);
    }

    function updateSetMetadata(uint256 setId, string calldata metadataURI) external {
        if (sets[setId].createdAt == 0) revert SetNotFound(setId);
        if (msg.sender != sets[setId].creator) revert NotSetCreator(setId);
        if (bytes(metadataURI).length == 0) revert InvalidURI();
        sets[setId].metadataURI = metadataURI;
        emit SetMetadataUpdated(setId, metadataURI);
    }

    // ─── Mint Normal Token ────────────────────────────────────────────────────

    // Mint Normal token vao Set. Neu price > 0 thi tu dong LISTED, nguoc lai ACTIVE.
    function mintNormal(
        uint256 setId,
        string calldata tokenURI,
        uint256 price,
        Trait[] calldata traits
    ) external whenNotPaused returns (uint256 tokenId) {
        if (sets[setId].createdAt == 0) revert SetNotFound(setId);
        if (msg.sender != sets[setId].creator) revert NotSetCreator(setId);
        if (bytes(tokenURI).length == 0) revert InvalidURI();
        if (traits.length > MAX_TRAITS) revert TooManyTraits(traits.length);

        tokenId = nextTokenId++;
        TokenState initialState = price > 0 ? TokenState.LISTED : TokenState.ACTIVE;

        tokens[tokenId] = TokenInfo({
            tokenId: tokenId,
            setId: setId,
            creator: msg.sender,
            tokenType: TokenType.NORMAL,
            price: price,
            redeemStart: 0,
            redeemEnd: 0,
            state: initialState,
            mintedAt: block.timestamp
        });

        _tokenURIs[tokenId] = tokenURI;
        _tokenOwner[tokenId] = msg.sender;
        sets[setId].tokenCount++;

        _mint(msg.sender, tokenId, 1, "");
        _setTraits(tokenId, traits);

        emit TokenMinted(tokenId, setId, msg.sender, TokenType.NORMAL, price);

        // Tu dong tao listing neu price > 0
        if (price > 0) {
            _createNormalListing(tokenId, msg.sender, price);
        }
    }

    // ─── Mint Phygital Token ──────────────────────────────────────────────────

    // Mint Phygital token. Seller phai gui collateral (50% price) cung luc.
    // Token duoc tao o state LISTED, listing tren PhygitalEscrow.
    function mintPhygital(
        uint256 setId,
        string calldata tokenURI,
        uint256 price,
        uint256 redeemStart,
        uint256 redeemEnd,
        Trait[] calldata traits,
        string calldata encPubkey
    ) external payable whenNotPaused returns (uint256 tokenId) {
        if (sets[setId].createdAt == 0) revert SetNotFound(setId);
        if (msg.sender != sets[setId].creator) revert NotSetCreator(setId);
        if (bytes(tokenURI).length == 0) revert InvalidURI();
        if (price == 0) revert InvalidPrice();
        if (traits.length > MAX_TRAITS) revert TooManyTraits(traits.length);
        if (redeemEnd <= redeemStart) revert InvalidRedeemWindow();

        uint256 collateral = phygitalEscrow.calcCollateral(price);
        if (msg.value != collateral) revert IncorrectPayment(collateral, msg.value);

        tokenId = nextTokenId++;

        tokens[tokenId] = TokenInfo({
            tokenId: tokenId,
            setId: setId,
            creator: msg.sender,
            tokenType: TokenType.PHYGITAL,
            price: price,
            redeemStart: redeemStart,
            redeemEnd: redeemEnd,
            state: TokenState.LISTED,
            mintedAt: block.timestamp
        });

        _tokenURIs[tokenId] = tokenURI;
        _tokenOwner[tokenId] = msg.sender;
        sets[setId].tokenCount++;

        _mint(msg.sender, tokenId, 1, "");
        _setTraits(tokenId, traits);

        emit TokenMinted(tokenId, setId, msg.sender, TokenType.PHYGITAL, price);

        // Forward collateral den PhygitalEscrow de tao listing
        IPhygitalEscrow(phygitalEscrow).createListing{value: msg.value}(
            tokenId,
            payable(msg.sender),
            price,
            redeemStart,
            redeemEnd
        );

        // Dang ky encryption pubkey cua seller trong cung 1 TX neu chua co
        IPhygitalEscrow(phygitalEscrow).setSellerPubkeyByCollection(msg.sender, encPubkey);
    }

    // ─── Create Set + Mint in one TX ─────────────────────────────────────────

    // Tao Set moi va mint Normal token trong 1 transaction.
    function createSetAndMintNormal(
        string calldata setMetadataURI,
        string calldata tokenURI,
        uint256 price,
        Trait[] calldata traits
    ) external whenNotPaused returns (uint256 setId, uint256 tokenId) {
        if (bytes(setMetadataURI).length == 0) revert InvalidURI();
        if (bytes(tokenURI).length == 0) revert InvalidURI();
        if (traits.length > MAX_TRAITS) revert TooManyTraits(traits.length);

        setId = nextSetId++;
        sets[setId] = Set({
            id: setId,
            creator: msg.sender,
            metadataURI: setMetadataURI,
            tokenCount: 0,
            createdAt: block.timestamp
        });
        emit SetCreated(setId, msg.sender, setMetadataURI);

        TokenState initialState = price > 0 ? TokenState.LISTED : TokenState.ACTIVE;
        tokenId = nextTokenId++;
        tokens[tokenId] = TokenInfo({
            tokenId: tokenId,
            setId: setId,
            creator: msg.sender,
            tokenType: TokenType.NORMAL,
            price: price,
            redeemStart: 0,
            redeemEnd: 0,
            state: initialState,
            mintedAt: block.timestamp
        });
        _tokenURIs[tokenId] = tokenURI;
        _tokenOwner[tokenId] = msg.sender;
        sets[setId].tokenCount++;
        _mint(msg.sender, tokenId, 1, "");
        _setTraits(tokenId, traits);
        emit TokenMinted(tokenId, setId, msg.sender, TokenType.NORMAL, price);

        if (price > 0) {
            _createNormalListing(tokenId, msg.sender, price);
        }
    }

    // Tao Set moi va mint Phygital token trong 1 transaction.
    function createSetAndMintPhygital(
        string calldata setMetadataURI,
        string calldata tokenURI,
        uint256 price,
        uint256 redeemStart,
        uint256 redeemEnd,
        Trait[] calldata traits,
        string calldata encPubkey
    ) external payable whenNotPaused returns (uint256 setId, uint256 tokenId) {
        if (bytes(setMetadataURI).length == 0) revert InvalidURI();
        if (bytes(tokenURI).length == 0) revert InvalidURI();
        if (price == 0) revert InvalidPrice();
        if (traits.length > MAX_TRAITS) revert TooManyTraits(traits.length);
        if (redeemEnd <= redeemStart) revert InvalidRedeemWindow();

        uint256 collateral = phygitalEscrow.calcCollateral(price);
        if (msg.value != collateral) revert IncorrectPayment(collateral, msg.value);

        setId = nextSetId++;
        sets[setId] = Set({
            id: setId,
            creator: msg.sender,
            metadataURI: setMetadataURI,
            tokenCount: 0,
            createdAt: block.timestamp
        });
        emit SetCreated(setId, msg.sender, setMetadataURI);

        tokenId = nextTokenId++;
        tokens[tokenId] = TokenInfo({
            tokenId: tokenId,
            setId: setId,
            creator: msg.sender,
            tokenType: TokenType.PHYGITAL,
            price: price,
            redeemStart: redeemStart,
            redeemEnd: redeemEnd,
            state: TokenState.LISTED,
            mintedAt: block.timestamp
        });
        _tokenURIs[tokenId] = tokenURI;
        _tokenOwner[tokenId] = msg.sender;
        sets[setId].tokenCount++;
        _mint(msg.sender, tokenId, 1, "");
        _setTraits(tokenId, traits);
        emit TokenMinted(tokenId, setId, msg.sender, TokenType.PHYGITAL, price);

        IPhygitalEscrow(phygitalEscrow).createListing{value: msg.value}(
            tokenId,
            payable(msg.sender),
            price,
            redeemStart,
            redeemEnd
        );

        // Dang ky encryption pubkey cua seller trong cung 1 TX neu chua co
        IPhygitalEscrow(phygitalEscrow).setSellerPubkeyByCollection(msg.sender, encPubkey);
    }

    // ─── Normal Marketplace ───────────────────────────────────────────────────

    // Owner list token Normal de ban. Chi ACTIVE token moi list duoc.
    function listNormalToken(uint256 tokenId, uint256 price) external whenNotPaused {
        if (price == 0) revert InvalidPrice();
        TokenInfo storage t = tokens[tokenId];
        if (t.mintedAt == 0) revert TokenNotFound(tokenId);
        if (t.tokenType != TokenType.NORMAL) revert WrongTokenType(t.tokenType);
        if (t.state != TokenState.ACTIVE) revert WrongTokenState(t.state);
        if (_tokenOwner[tokenId] != msg.sender) revert NotTokenOwner(tokenId);

        t.state = TokenState.LISTED;
        t.price = price;

        _createNormalListing(tokenId, msg.sender, price);
    }

    // Buyer mua token Normal dang LISTED.
    function buyNormalToken(uint256 listingId) external payable whenNotPaused {
        NormalListing storage nl = normalListings[listingId];
        if (!nl.active) revert ListingNotActive(listingId);
        if (msg.sender == nl.seller) revert SelfPurchase();
        if (msg.value != nl.price) revert IncorrectPayment(nl.price, msg.value);

        nl.active = false;

        TokenInfo storage t = tokens[nl.tokenId];
        t.state = TokenState.ACTIVE;
        t.price = 0;

        // Transfer token: dung internal _safeTransferFrom, bypass _update restriction
        // bang cach set state ACTIVE truoc khi transfer
        address seller = nl.seller;
        _safeTransferFrom(seller, msg.sender, nl.tokenId, 1, "");

        // Phan chia tien
        uint256 fee = (nl.price * normalFeeBps) / 10_000;
        uint256 sellerPayout = nl.price - fee;
        accumulatedNormalFees += fee;

        _sendEth(payable(seller), sellerPayout);

        emit NormalTokenSold(listingId, nl.tokenId, msg.sender, nl.price);
    }

    // Seller huy listing Normal. Token tro lai ACTIVE.
    function cancelNormalListing(uint256 listingId) external {
        NormalListing storage nl = normalListings[listingId];
        if (!nl.active) revert ListingNotActive(listingId);
        if (msg.sender != nl.seller) revert NotTokenOwner(nl.tokenId);

        nl.active = false;
        tokens[nl.tokenId].state = TokenState.ACTIVE;
        tokens[nl.tokenId].price = 0;

        emit NormalListingCancelled(listingId, nl.tokenId);
    }

    // ─── ESCROW_ROLE Actions ──────────────────────────────────────────────────

    // PhygitalEscrow goi ham nay de lock token khi redeem.
    function lockToken(uint256 tokenId) external onlyRole(ESCROW_ROLE) {
        TokenInfo storage t = tokens[tokenId];
        if (t.state == TokenState.BURNED) revert WrongTokenState(t.state);
        t.state = TokenState.LOCKED;
    }

    // PhygitalEscrow goi ham nay de burn token khi hoan tat giao hang.
    function burnToken(uint256 tokenId) external onlyRole(ESCROW_ROLE) {
        TokenInfo storage t = tokens[tokenId];
        if (t.state == TokenState.BURNED) revert WrongTokenState(t.state);

        address owner = _tokenOwner[tokenId];
        t.state = TokenState.BURNED;
        _burn(owner, tokenId, 1);
        delete _tokenOwner[tokenId];
    }

    // Unlock token (khi dispute buyer thang, token tra ve ACTIVE).
    function unlockToken(uint256 tokenId) external onlyRole(ESCROW_ROLE) {
        TokenInfo storage t = tokens[tokenId];
        if (t.state != TokenState.LOCKED) revert WrongTokenState(t.state);
        t.state = TokenState.ACTIVE;
    }

    // PhygitalEscrow transfer token khi buyer mua Phygital.
    function escrowTransfer(uint256 tokenId, address from, address to) external onlyRole(ESCROW_ROLE) {
        _safeTransferFrom(from, to, tokenId, 1, "");
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _tokenOwner[tokenId];
    }

    function getTokenInfo(uint256 tokenId) external view returns (TokenInfo memory) {
        return tokens[tokenId];
    }

    function getSet(uint256 setId) external view returns (Set memory) {
        return sets[setId];
    }

    function getTraits(uint256 tokenId) external view returns (Trait[] memory) {
        return _tokenTraits[tokenId];
    }

    function getNormalListing(uint256 listingId) external view returns (NormalListing memory) {
        return normalListings[listingId];
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        return _tokenURIs[tokenId];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _setTraits(uint256 tokenId, Trait[] calldata traits) internal {
        for (uint256 i = 0; i < traits.length; i++) {
            _tokenTraits[tokenId].push(traits[i]);
        }
        if (traits.length > 0) {
            emit TraitsSet(tokenId, traits.length);
        }
    }

    function _createNormalListing(uint256 tokenId, address seller, uint256 price) internal {
        uint256 listingId = nextNormalListingId++;
        normalListings[listingId] = NormalListing({
            id: listingId,
            tokenId: tokenId,
            seller: payable(seller),
            price: price,
            active: true
        });
        normalListingByToken[tokenId] = listingId;

        emit NormalTokenListed(listingId, tokenId, seller, price);
    }

    function _sendEth(address payable to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // Override _update de enforce transfer restrictions va track ownership.
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155Upgradeable, ERC1155SupplyUpgradeable) {
        // Enforce transfer restrictions per-token
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 tokenId = ids[i];
            TokenInfo storage t = tokens[tokenId];

            if (from != address(0) && to != address(0)) {
                // Regular transfer (not mint/burn)
                if (t.state == TokenState.LOCKED) {
                    revert TransferRestricted(tokenId);
                }
                if (t.state == TokenState.LISTED) {
                    // Chi ESCROW_ROLE hoac contract nay (Normal marketplace) moi duoc transfer
                    if (msg.sender != address(this) && !hasRole(ESCROW_ROLE, msg.sender)) {
                        revert TransferRestricted(tokenId);
                    }
                }
                // ACTIVE: tu do transfer
            }

            // Track ownership
            if (to != address(0) && from != to) {
                _tokenOwner[tokenId] = to;
            }
        }

        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    // 12 own vars -> gap = 50 - 12 = 38
    uint256[38] private __gap;
}
