// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ─── Enums ────────────────────────────────────────────────────────────────────

// Loai token: collectible thong thuong hoac phygital (hang vat ly).
enum TokenType {
    NORMAL,   // NFT collectible, co the list/buy tren marketplace
    PHYGITAL  // NFT dai dien hang vat ly, redeem de nhan hang that
}

// Trang thai cua mot token trong MarketCollection.
enum TokenState {
    ACTIVE,  // Token tu do, chua list ban va chua redeem
    LISTED,  // Dang duoc rao ban tren marketplace (Normal) hoac escrow (Phygital)
    LOCKED,  // Token bi khoa khi redeem Phygital, khong chuyen nhuong duoc
    BURNED   // Token da bi burn vinh vien
}

// Trang thai cua mot listing tren san (Phygital escrow + Normal marketplace).
enum ListingStatus {
    ACTIVE,     // Seller da dang ban, chua co buyer
    SOLD,       // Buyer da mua, NFT chuyen owner
    REDEEMED,   // Holder da redeem de doi hang that (chi Phygital)
    SHIPPED,    // Seller da xac nhan gui hang
    COMPLETED,  // Da hoan tat va giai ngan seller
    DISPUTED,   // Dang tranh chap tai JuryDAO
    REFUNDED,   // Buyer/redeemer thang tranh chap, hoan tien
    EXPIRED,    // Het han redeem ma khong ai redeem
    CANCELLED   // Seller huy listing truoc khi co buyer
}

// Phieu bieu quyet cua moi juror.
enum Vote {
    NONE,       // Chua vote
    FOR_BUYER,  // Vote cho buyer thang
    FOR_SELLER  // Vote cho seller thang
}

// Trang thai cua mot vu tranh chap.
enum CaseStatus {
    OPEN,      // Dang nhan phieu, trong votingDeadline
    RESOLVED,  // Du da so phieu -> co verdict ro rang
    DEFAULTED  // Het han, khong du da so -> buyer mac dinh thang
}

// ─── Structs ──────────────────────────────────────────────────────────────────

// Trait dang key:value, luu on-chain cho moi token (toi da 20).
struct Trait {
    string key;
    string value;
}

// Mot Set (collection) trong he thong ERC1155 shared.
struct Set {
    uint256 id;
    address creator;
    string metadataURI;   // IPFS URI chua metadata cua Set
    uint256 tokenCount;   // So token da mint trong Set nay
    uint256 createdAt;
}

// Thong tin chi tiet mot token (ERC1155 supply=1, hanh vi NFT).
struct TokenInfo {
    uint256 tokenId;
    uint256 setId;
    address creator;       // Nguoi tao (seller goc)
    TokenType tokenType;
    uint256 price;         // Gia ban (Normal: marketplace, Phygital: escrow)
    uint256 redeemStart;   // Thoi diem bat dau redeem (chi Phygital, absolute)
    uint256 redeemEnd;     // Thoi diem ket thuc redeem (chi Phygital, absolute)
    TokenState state;
    uint256 mintedAt;
}

// Listing tren PhygitalEscrow hoac Normal marketplace.
struct Listing {
    uint256 id;
    uint256 tokenId;
    address payable seller;
    address payable buyer;
    address payable redeemer;     // Nguoi giu NFT tai thoi diem redeem
    address payable challenger;   // Nguoi mo tranh chap (redeemer)
    uint256 price;
    uint256 collateral;
    bytes32 shippingInfoHash;     // Hash cua shipping info
    string  shippingInfoURI;      // IPFS URI chua thong tin giao hang (structured JSON)
    string  shippingProofURI;     // IPFS URI chua minh chung da gui hang cua seller
    uint256 listedAt;
    uint256 soldAt;
    uint256 redeemedAt;
    uint256 shippedAt;
    uint256 shippingDeadline;     // Han seller phai ship (14 ngay sau redeem)
    uint256 disputeDeadline;      // Han buyer raise dispute (14 ngay sau ship)
    uint256 disputeOpenedAt;
    uint256 disputeFeeAmount;
    bytes32 disputeEvidenceHash;
    string disputeEvidenceURI;
    ListingStatus status;
}

// Ho so cua mot juror trong pool.
struct Juror {
    uint256 stakedAmount;   // So $TRUST dang bi khoa trong JuryDAO
    uint256 casesServed;    // So vu da tham gia xet xu
    uint256 correctVotes;   // So lan vote dung theo majority
    uint256 stakedAt;       // Timestamp bat dau stake hien tai
    uint256 unlockAt;       // Timestamp duoc phep unstake (stake lock)
    uint256 cooldownUntil;  // Timestamp duoc phep register lai sau khi roi pool
    uint256 lifetimeSlash;  // Tong so TRUST da bi slash trong lich su
    bool active;            // Dang trong juror pool
}

// Mot vu tranh chap duoc JuryDAO xet xu.
struct Case {
    uint256 id;
    uint256 listingId;
    address buyer;
    address seller;
    address challenger;
    uint256 disputeFeeAmount;
    bytes32 evidenceHash;
    string evidenceURI;
    bytes32 sellerEvidenceHash;
    string sellerEvidenceURI;
    address[3] jurors;
    uint8 votesForBuyer;
    uint8 votesForSeller;
    uint8 voteCount;      // So juror da vote (0-3)
    uint256 openedAt;
    uint256 voteDeadline; // Thoi han voting (block.timestamp + votePeriod)
    CaseStatus status;
}
