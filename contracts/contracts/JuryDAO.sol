// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import "./interfaces/ITrustToken.sol";
import "./interfaces/IPhygitalEscrow.sol";
import "./libraries/MarketTypes.sol";

/**
 * JuryDAO quan ly juror pool va voting truc tiep (direct vote).
 * Random 3 juror duoc chon (Fisher-Yates shuffle voi prevrandao).
 * Auto-finalize khi du 2/3 da so hoac ca 3 da vote.
 */
contract JuryDAO is Initializable, OwnableUpgradeable, ReentrancyGuard, UUPSUpgradeable {
    ITrustToken public trustToken;
    IPhygitalEscrow public phygitalEscrow;

    address[] public jurorPool;
    mapping(address => uint256) private _jurorIndex; // 1-based index
    mapping(address => Juror) public jurors;

    uint256 public nextCaseId;
    mapping(uint256 => Case) public cases;
    mapping(uint256 => uint256) public listingCaseId; // listingId => caseId

    mapping(uint256 => mapping(address => Vote)) private _votes;
    mapping(uint256 => mapping(address => bool)) private _rewardClaimed;
    mapping(uint256 => uint256) public rewardPool;

    mapping(uint256 => mapping(address => bool)) private _hasVoted;

    mapping(address => uint256) private _activeJurorCases;

    uint256 public minStake;
    uint256 public votePeriod;
    uint256 public stakeLockPeriod;
    uint256 public rejoinCooldown;
    uint256 public slashedStakeTreasury;

    error OnlyPhygitalEscrow();
    error NotEnoughJurors(uint256 available, uint256 required);
    error AlreadyRegistered();
    error NotRegistered();
    error NotAssignedJuror(uint256 caseId);
    error VotingStillOpen(uint256 caseId);
    error CaseNotResolved(uint256 caseId);
    error DidNotVoteCorrectly(uint256 caseId);
    error RewardAlreadyClaimed();
    error HasActiveCase();
    error TransferFailed();
    error WrongCaseStatus(CaseStatus current);
    error InvalidAddress();
    error PeriodTooShort();
    error CooldownActive(uint256 cooldownUntil);
    error StakeLockedUntil(uint256 unlockAt);
    error AlreadyVoted(uint256 caseId);
    error VoteDeadlinePassed(uint256 voteDeadline);
    error InvalidBps();
    error InsufficientSlashedTreasury(uint256 requested, uint256 available);
    error NotCaseParticipant(uint256 caseId);
    error SellerEvidenceAlreadySubmitted(uint256 caseId);
    error MissingEvidence();

    event JurorRegistered(address indexed juror, uint256 staked, uint256 unlockAt);
    event JurorCooldownSet(address indexed juror, uint256 cooldownUntil);
    event JurorUnregistered(address indexed juror, uint256 unstaked, uint256 cooldownUntil);
    event JurorSlashed(address indexed juror, uint256 indexed caseId, uint256 amount, uint8 reasonCode);

    event CaseOpenedFull(
        uint256 indexed caseId,
        uint256 indexed listingId,
        address indexed challenger,
        address buyer,
        address seller,
        uint256 disputeFeeAmount,
        bytes32 evidenceHash,
        string evidenceURI,
        address[3] jurors,
        uint256 openedAt,
        uint256 voteDeadline
    );

    event VoteCast(
        uint256 indexed caseId,
        address indexed juror,
        bool voteForBuyer,
        string reason,
        uint256 votedAt
    );

    event VerdictFinalized(
        uint256 indexed caseId,
        uint256 indexed listingId,
        bool buyerWins,
        CaseStatus status,
        uint8 votesForBuyer,
        uint8 votesForSeller,
        uint8 voteCount
    );

    event RewardClaimed(uint256 indexed caseId, address indexed juror, uint256 amount, uint256 claimedAt);
    event PhygitalEscrowSet(address indexed phygitalEscrow);
    event MinStakeUpdated(uint256 minStake);
    event VotePeriodUpdated(uint256 votePeriod);
    event StakeLockPeriodUpdated(uint256 stakeLockPeriod);
    event RejoinCooldownUpdated(uint256 rejoinCooldown);
    event SlashedTreasuryWithdrawn(address indexed to, uint256 amount);
    event CounterEvidenceSubmitted(uint256 indexed caseId, address indexed seller, bytes32 evidenceHash, string evidenceURI);

    modifier onlyPhygitalEscrowContract() {
        if (msg.sender != address(phygitalEscrow)) revert OnlyPhygitalEscrow();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _trustToken, address initialOwner) external initializer {
        __Ownable_init(initialOwner);

        trustToken = ITrustToken(_trustToken);
        minStake = 100 ether;
        votePeriod = 2 days;
        stakeLockPeriod = 7 days;
        rejoinCooldown = 3 days;
    }

    function setPhygitalEscrow(address _phygitalEscrow) external onlyOwner {
        if (_phygitalEscrow == address(0)) revert InvalidAddress();
        phygitalEscrow = IPhygitalEscrow(_phygitalEscrow);
        emit PhygitalEscrowSet(_phygitalEscrow);
    }

    function setMinStake(uint256 _minStake) external onlyOwner {
        minStake = _minStake;
        emit MinStakeUpdated(_minStake);
    }

    function setVotePeriod(uint256 _votePeriod) external onlyOwner {
        if (_votePeriod < 1 hours) revert PeriodTooShort();
        votePeriod = _votePeriod;
        emit VotePeriodUpdated(_votePeriod);
    }

    function setStakeLockPeriod(uint256 _stakeLockPeriod) external onlyOwner {
        if (_stakeLockPeriod < 1 days) revert PeriodTooShort();
        stakeLockPeriod = _stakeLockPeriod;
        emit StakeLockPeriodUpdated(_stakeLockPeriod);
    }

    function setRejoinCooldown(uint256 _rejoinCooldown) external onlyOwner {
        if (_rejoinCooldown < 1 hours) revert PeriodTooShort();
        rejoinCooldown = _rejoinCooldown;
        emit RejoinCooldownUpdated(_rejoinCooldown);
    }

    function withdrawSlashedTrust(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        if (amount > slashedStakeTreasury) {
            revert InsufficientSlashedTreasury(amount, slashedStakeTreasury);
        }

        slashedStakeTreasury -= amount;
        bool ok = trustToken.transfer(to, amount);
        require(ok, "TRUST transfer failed");

        emit SlashedTreasuryWithdrawn(to, amount);
    }

    function withdrawStuckEth(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        _sendEth(to, amount);
    }

    function registerJuror() external {
        Juror storage j = jurors[msg.sender];

        if (j.active) revert AlreadyRegistered();
        if (block.timestamp < j.cooldownUntil) revert CooldownActive(j.cooldownUntil);

        // CEI: update state truoc khi transfer token
        j.active = true;
        j.stakedAmount = minStake;
        j.stakedAt = block.timestamp;
        j.unlockAt = block.timestamp + stakeLockPeriod;

        jurorPool.push(msg.sender);
        _jurorIndex[msg.sender] = jurorPool.length;

        bool ok = trustToken.transferFrom(msg.sender, address(this), minStake);
        require(ok, "TRUST transfer failed");

        emit JurorRegistered(msg.sender, minStake, j.unlockAt);
    }

    function unregisterJuror() external nonReentrant {
        Juror storage j = jurors[msg.sender];

        if (!j.active) revert NotRegistered();
        if (_activeJurorCases[msg.sender] > 0) revert HasActiveCase();
        if (block.timestamp < j.unlockAt) revert StakeLockedUntil(j.unlockAt);

        uint256 staked = j.stakedAmount;

        uint256 idx = _jurorIndex[msg.sender] - 1;
        uint256 lastIdx = jurorPool.length - 1;

        if (idx != lastIdx) {
            address lastJuror = jurorPool[lastIdx];
            jurorPool[idx] = lastJuror;
            _jurorIndex[lastJuror] = idx + 1;
        }

        jurorPool.pop();
        delete _jurorIndex[msg.sender];

        j.active = false;
        j.stakedAmount = 0;
        j.stakedAt = 0;
        j.unlockAt = 0;
        j.cooldownUntil = block.timestamp + rejoinCooldown;

        emit JurorCooldownSet(msg.sender, j.cooldownUntil);

        bool ok = trustToken.transfer(msg.sender, staked);
        require(ok, "TRUST transfer failed");

        emit JurorUnregistered(msg.sender, staked, j.cooldownUntil);
    }

    function openCase(
        uint256 listingId,
        address buyer,
        address seller,
        address challenger,
        uint256 disputeFeeAmount,
        bytes32 evidenceHash,
        string calldata evidenceURI
    ) external payable onlyPhygitalEscrowContract returns (uint256 caseId) {
        address[3] memory selected = _selectJurors(buyer, seller);

        caseId = nextCaseId++;

        uint256 voteDeadline = block.timestamp + votePeriod;

        cases[caseId] = Case({
            id: caseId,
            listingId: listingId,
            buyer: buyer,
            seller: seller,
            challenger: challenger,
            disputeFeeAmount: disputeFeeAmount,
            evidenceHash: evidenceHash,
            evidenceURI: evidenceURI,
            sellerEvidenceHash: bytes32(0),
            sellerEvidenceURI: "",
            jurors: selected,
            votesForBuyer: 0,
            votesForSeller: 0,
            voteCount: 0,
            openedAt: block.timestamp,
            voteDeadline: voteDeadline,
            status: CaseStatus.OPEN
        });

        rewardPool[caseId] = msg.value;
        listingCaseId[listingId] = caseId;

        for (uint256 i = 0; i < 3; i++) {
            _activeJurorCases[selected[i]]++;
            jurors[selected[i]].casesServed++;
        }

        emit CaseOpenedFull(
            caseId,
            listingId,
            challenger,
            buyer,
            seller,
            disputeFeeAmount,
            evidenceHash,
            evidenceURI,
            selected,
            block.timestamp,
            voteDeadline
        );
    }

    /// @notice Seller submits counter-evidence for an open dispute case.
    function submitCounterEvidence(
        uint256 caseId,
        bytes32 evidenceHash,
        string calldata evidenceURI
    ) external {
        Case storage c = cases[caseId];
        if (c.status != CaseStatus.OPEN) revert WrongCaseStatus(c.status);
        if (msg.sender != c.seller) revert NotCaseParticipant(caseId);
        if (evidenceHash == bytes32(0) || bytes(evidenceURI).length == 0) revert MissingEvidence();
        if (c.sellerEvidenceHash != bytes32(0)) revert SellerEvidenceAlreadySubmitted(caseId);

        c.sellerEvidenceHash = evidenceHash;
        c.sellerEvidenceURI = evidenceURI;

        emit CounterEvidenceSubmitted(caseId, msg.sender, evidenceHash, evidenceURI);
    }

    /// @notice Juror casts a direct vote. Auto-finalizes when majority or all 3 voted.
    function castVote(uint256 caseId, bool voteForBuyer, string calldata reason) external {
        Case storage c = cases[caseId];

        if (c.status != CaseStatus.OPEN) revert WrongCaseStatus(c.status);
        if (block.timestamp > c.voteDeadline) revert VoteDeadlinePassed(c.voteDeadline);
        if (!_isAssignedJuror(c, msg.sender)) revert NotAssignedJuror(caseId);
        if (_hasVoted[caseId][msg.sender]) revert AlreadyVoted(caseId);

        _hasVoted[caseId][msg.sender] = true;

        if (voteForBuyer) {
            _votes[caseId][msg.sender] = Vote.FOR_BUYER;
            c.votesForBuyer++;
        } else {
            _votes[caseId][msg.sender] = Vote.FOR_SELLER;
            c.votesForSeller++;
        }
        c.voteCount++;

        emit VoteCast(caseId, msg.sender, voteForBuyer, reason, block.timestamp);

        // Auto-finalize khi dat da so hoac ca 3 da vote
        bool earlyMajority = c.votesForBuyer >= 2 || c.votesForSeller >= 2;
        if (c.voteCount == 3 || earlyMajority) {
            _finalizeCase(caseId, c);
        }
    }

    /// @notice Finalizes verdict after voteDeadline if auto-finalize hasn't triggered.
    function finalizeVerdict(uint256 caseId) external {
        Case storage c = cases[caseId];

        if (c.status != CaseStatus.OPEN) revert WrongCaseStatus(c.status);
        if (block.timestamp <= c.voteDeadline && c.voteCount < 3) {
            revert VotingStillOpen(caseId);
        }

        _finalizeCase(caseId, c);
    }

    function claimReward(uint256 caseId) external nonReentrant {
        Case storage c = cases[caseId];

        if (c.status != CaseStatus.RESOLVED) revert CaseNotResolved(caseId);
        if (_rewardClaimed[caseId][msg.sender]) revert RewardAlreadyClaimed();
        if (!_isAssignedJuror(c, msg.sender)) revert NotAssignedJuror(caseId);
        if (!_hasVoted[caseId][msg.sender]) revert DidNotVoteCorrectly(caseId);

        bool buyerWon = c.votesForBuyer >= 2;
        Vote jurorVote = _votes[caseId][msg.sender];
        bool votedCorrectly = (buyerWon && jurorVote == Vote.FOR_BUYER)
            || (!buyerWon && jurorVote == Vote.FOR_SELLER);
        if (!votedCorrectly) revert DidNotVoteCorrectly(caseId);

        uint256 winnerCount = _winnerCount(caseId, buyerWon);
        if (winnerCount == 0) revert DidNotVoteCorrectly(caseId);

        _rewardClaimed[caseId][msg.sender] = true;

        uint256 reward = rewardPool[caseId] / winnerCount;
        _sendEth(payable(msg.sender), reward);

        emit RewardClaimed(caseId, msg.sender, reward, block.timestamp);
    }

    function jurorPoolSize() external view returns (uint256) {
        return jurorPool.length;
    }

    function getCase(uint256 caseId) external view returns (Case memory) {
        return cases[caseId];
    }

    function getVote(uint256 caseId, address juror) external view returns (Vote) {
        return _votes[caseId][juror];
    }

    function hasVoted(uint256 caseId, address juror) external view returns (bool) {
        return _hasVoted[caseId][juror];
    }

    function isRewardClaimed(uint256 caseId, address juror) external view returns (bool) {
        return _rewardClaimed[caseId][juror];
    }

    function _finalizeCase(uint256 caseId, Case storage c) internal {
        bool buyerWins;
        CaseStatus newStatus;

        if (c.votesForBuyer >= 2) {
            buyerWins = true;
            newStatus = CaseStatus.RESOLVED;
            _markCorrectVoters(caseId, true);
        } else if (c.votesForSeller >= 2) {
            buyerWins = false;
            newStatus = CaseStatus.RESOLVED;
            _markCorrectVoters(caseId, false);
        } else {
            // Khong du da so (0-1 vote) -> buyer thang mac dinh (DEFAULTED)
            buyerWins = true;
            newStatus = CaseStatus.DEFAULTED;
        }

        c.status = newStatus;

        for (uint256 i = 0; i < 3; i++) {
            if (_activeJurorCases[c.jurors[i]] > 0) {
                _activeJurorCases[c.jurors[i]]--;
            }
        }

        emit VerdictFinalized(
            caseId,
            c.listingId,
            buyerWins,
            newStatus,
            c.votesForBuyer,
            c.votesForSeller,
            c.voteCount
        );

        phygitalEscrow.executeVerdict(c.listingId, buyerWins);
    }

    function _selectJurors(
        address buyer,
        address seller
    ) internal view returns (address[3] memory selected) {
        uint256 poolSize = jurorPool.length;
        if (poolSize < 3) revert NotEnoughJurors(poolSize, 3);

        uint256[] memory indices = new uint256[](poolSize);
        for (uint256 i = 0; i < poolSize; i++) {
            indices[i] = i;
        }

        uint256 seed = uint256(
            keccak256(abi.encodePacked(block.prevrandao, block.timestamp, buyer, seller, poolSize))
        );

        uint256 found = 0;

        for (uint256 i = 0; i < poolSize && found < 3; i++) {
            uint256 j = i + (seed % (poolSize - i));
            seed = uint256(keccak256(abi.encodePacked(seed)));

            uint256 tmp = indices[i];
            indices[i] = indices[j];
            indices[j] = tmp;

            address candidate = jurorPool[indices[i]];
            if (candidate != buyer && candidate != seller) {
                selected[found] = candidate;
                found++;
            }
        }

        if (found < 3) revert NotEnoughJurors(found, 3);
    }

    function _isAssignedJuror(Case storage c, address juror) internal view returns (bool) {
        for (uint256 i = 0; i < 3; i++) {
            if (c.jurors[i] == juror) {
                return true;
            }
        }
        return false;
    }

    function _winnerCount(uint256 caseId, bool buyerWon) internal view returns (uint256 count) {
        Case storage c = cases[caseId];
        for (uint256 i = 0; i < 3; i++) {
            address juror = c.jurors[i];
            if (!_hasVoted[caseId][juror]) continue;

            Vote v = _votes[caseId][juror];
            if ((buyerWon && v == Vote.FOR_BUYER) || (!buyerWon && v == Vote.FOR_SELLER)) {
                count++;
            }
        }
    }

    function _markCorrectVoters(uint256 caseId, bool buyerWins) internal {
        Case storage c = cases[caseId];
        for (uint256 i = 0; i < 3; i++) {
            address juror = c.jurors[i];
            if (!_hasVoted[caseId][juror]) continue;

            Vote v = _votes[caseId][juror];
            if ((buyerWins && v == Vote.FOR_BUYER) || (!buyerWins && v == Vote.FOR_SELLER)) {
                jurors[juror].correctVotes++;
            }
        }
    }

    function _sendEth(address payable to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    receive() external payable {}

    // 19 own vars -> gap 31 de giu tong 50 slots theo convention OZ
    uint256[31] private __gap;
}
