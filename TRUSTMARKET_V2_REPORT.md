# TrustMarket V2 — Smart Contracts Architecture & Business Logic Report

**Date:** March 17, 2026
**Version:** 2.0 (Direct Voting, UUPS Upgradeable)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technology Stack](#technology-stack)
3. [System Architecture](#system-architecture)
4. [Contract Breakdown](#contract-breakdown)
5. [Business Logic & Workflows](#business-logic--workflows)
6. [Key Features](#key-features)

---

## Executive Summary

**TrustMarket V2** is a decentralized NFT marketplace supporting two token types:

- **NORMAL**: Collectible NFTs traded peer-to-peer with a simple buy/sell mechanism
- **PHYGITAL**: NFTs representing physical goods with escrow-backed redemption, shipping verification, and jury-based dispute resolution

The platform introduces a **JuryDAO** for decentralized arbitration when disputes arise. Jurors stake **$TRUST** tokens to participate and earn rewards for correct verdicts. All contracts use **UUPS upgradeable proxy pattern** for future flexibility.

**Core Innovation:** Passive settlement + seller counter-evidence submission enabling fair dispute resolution without requiring buyer confirmation of delivery.

---

## Technology Stack

### Smart Contracts
- **Solidity 0.8.28** (Ethereum-compatible)
- **OpenZeppelin Contracts v5.2.0** (ERC1155, AccessControl, UUPS Proxy)
- **OpenZeppelin Upgrades Plugin** (UUPS proxy management)
- **Hardhat 2.22.17** (development framework)
- **Chai & Ethers.js** (testing & deployment)

### Frontend
- **React 19** + **Vite** (UI framework & bundler)
- **Tailwind CSS 4** (styling)
- **wagmi 2.19.5** + **viem 2.47.1** (Web3 integration)
- **RainbowKit** (wallet connection)
- **React Router 7** (navigation)
- **TweetNaCl.js** (NaCl X25519 encryption for shipping info)
- **Pinata/IPFS** (distributed data storage)

### Deployment
- **Networks:** Localhost (Hardhat), Sepolia (testnet), Mainnet-ready
- **Proxy Pattern:** UUPS (Universal Upgradeable Proxy Standard)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      TrustMarket V2 System                      │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────┐
│  MarketCollection    │  │   PhygitalEscrow     │  │    JuryDAO   │
│   (ERC1155 NFTs)     │  │  (Escrow + Shipping) │  │  (Disputes)  │
│                      │  │                      │  │              │
│ - Create Sets        │  │ - Create Listings    │  │ - Register   │
│ - Mint NORMAL        │  │ - Handle Buys        │  │ - Cast Votes │
│ - Mint PHYGITAL      │  │ - Lock/Burn Tokens   │  │ - Finalize   │
│ - List/Buy/Cancel    │  │ - Ship & Redirect    │  │   Verdicts   │
│ - Token State        │  │ - Dispute Opening    │  │ - Claim      │
│   Management         │  │                      │  │   Rewards    │
└──────────────────────┘  └──────────────────────┘  └──────────────┘
         ▲                          ▲                       ▲
         │                          │                       │
         └──────────────────────────┴───────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                ┌───────────┐             ┌──────────┐
                │ TrustToken│             │  IPFS    │
                │   ($TRUST)│             │ (DataURI)│
                │           │             │          │
                │ - Mint    │             │ Evidence,│
                │ - Stake   │             │ Shipping │
                │ - Slash   │             │ Metadata │
                └───────────┘             └──────────┘
```

---

## Contract Breakdown

### 1. **TrustToken** — Governance & Incentive Token

**Purpose:** ERC20 token for juror staking and reward distribution.

**Key Variables:**
- `MAX_SUPPLY = 100,000,000 TRUST` (100M supply cap)

**Core Functions:**

| Function | Caller | Behavior |
|----------|--------|----------|
| `initialize(address initialOwner)` | Proxy deployer | Init ERC20, set owner |
| `mint(address to, uint256 amount)` | Owner only | Mint up to MAX_SUPPLY; emit transfer logs |
| `transfer(address to, uint256 amount)` | Anyone | Standard ERC20 transfer |
| `approve(address spender, uint256 amount)` | Token holder | Allow spender to transfer tokens |
| `transferFrom(address from, address to, uint256 amount)` | Approved spender | Transfer on behalf (used by JuryDAO for stake collection) |

**Storage:**
```
MAX_SUPPLY = 100M TRUST
totalSupply = current minted amount
balances[address] = token balance per address
allowances[owner][spender] = approved spender amount
```

---

### 2. **MarketCollection** — NFT Registry & Normal Marketplace

**Purpose:** ERC1155 NFT contract supporting NORMAL tokens (simple buy/sell) and PHYGITAL tokens (escrow-backed physical goods).

**Key Variables:**
- `nextSetId` — auto-increment Set ID counter
- `nextTokenId` — auto-increment Token ID counter
- `nextNormalListingId` — auto-increment for Normal token listings
- `sets[setId]` → Set struct (creator, metadataURI, tokenCount, createdAt)
- `tokens[tokenId]` → TokenInfo (TokenType, TokenState, price, traits, redeemStart/End)
- `normalListings[listingId]` → NormalListing (seller, price, active flag)
- `_tokenOwner[tokenId]` — current owner tracking
- `_tokenTraits[tokenId][]` → Trait array (max 20 per token)
- `phygitalEscrow` — ref to PhygitalEscrow contract
- `ESCROW_ROLE` — access control for PhygitalEscrow to lock/burn/transfer tokens
- `normalFeeBps = 200` (2% platform fee on Normal sales)

**Core Functions:**

| Function | Caller | Input | Behavior |
|----------|--------|-------|----------|
| `createSet(metadataURI)` | Anyone | IPFS metadata URI | Create collection; return setId |
| `updateSetMetadata(setId, newMetadataURI)` | Set creator | New IPFS URI | Update collection metadata |
| `mintNormal(setId, tokenURI, price, traits[])` | Set creator | Token details | Mint ERC1155 token; if price > 0, auto-list (state=LISTED); else ACTIVE |
| `mintPhygital(setId, tokenURI, price, redeemStart, redeemEnd, traits[])` | Set creator | + collateral (50% of price) | Mint & forward to PhygitalEscrow for listing |
| `createSetAndMintNormal(setMetadataURI, tokenURI, price, traits[])` | Anyone | Set + token data | Combine createSet + mintNormal in 1 TX |
| `createSetAndMintPhygital(...)` | Anyone | Set + token + collateral | Combine createSet + mintPhygital in 1 TX |
| `listNormalToken(tokenId, price)` | Token owner | Token ID, new price | Change state ACTIVE → LISTED; update price |
| `buyNormalToken(listingId)` | Buyer | Listing ID + payment | Pay exact price → transfer token → record 2% fee → payout seller |
| `cancelNormalListing(listingId)` | Seller | Listing ID | Deactivate listing; revert token to ACTIVE state |
| `lockToken(tokenId)` | ESCROW_ROLE | Token ID | Set state LOCKED (used during Phygital redeem) |
| `burnToken(tokenId)` | ESCROW_ROLE | Token ID | Set state BURNED; burn ERC1155 supply |
| `unlockToken(tokenId)` | ESCROW_ROLE | Token ID | Set state LOCKED → ACTIVE (buyer wins dispute) |
| `escrowTransfer(tokenId, from, to)` | ESCROW_ROLE | Addresses | Internal transfer (Phygital buyer claim) |
| `getTokenInfo(tokenId)` | Anyone (view) | Token ID | Return full TokenInfo struct |
| `getTraits(tokenId)` | Anyone (view) | Token ID | Return Trait[] for token |
| `uri(tokenId)` | Anyone (view) | Token ID | Return token metadata URI |

**Token State Transitions:**
```
NORMAL Token:
ACTIVE → LISTED (list) → ACTIVE (cancel) → LISTED (rebuy) → ACTIVE (purchased)

PHYGITAL Token:
LISTED (minted) → LOCKED (upon redeem) → ACTIVE (dispute buyer wins) / BURNED (completed)
```

---

### 3. **PhygitalEscrow** — Escrow & Shipping Management

**Purpose:** Orchestrate Phygital token lifecycle: listing → buy → redeem (lock NFT + hash shipping info) → ship/confirm → settle or dispute.

**Key Variables:**
- `nextListingId` — auto-increment listing counter
- `listings[listingId]` → Listing struct (seller, buyer, redeemer, price, collateral, status, deadlines, evidence URIs)
- `listingByToken[tokenId]` → mapping to find listing by token
- `sellerEncryptionPubkeys[sellerAddress]` → NaCl X25519 pub key for buyer to encrypt shipping info
- `platformFeeBps = 200` (2% platform cut)
- `collateralBps = 5_000` (50% of price locked from seller)
- `disputeFeeBps = 500` (5% of price charged from buyer to open dispute)
- `shippingPeriod = 14 days` (time for seller to ship after redeem)
- `disputePeriod = 14 days` (time for buyer to raise dispute after ship confirmed)
- `collection` → ref to MarketCollection
- `juryDAO` → ref to JuryDAO

**Listing Statuses:**
```
ACTIVE     → Seller has listed, no buyer yet
SOLD       → Buyer purchased, NFT transferred
REDEEMED   → Holder redeemed (locked token), shipping details submitted
SHIPPED    → Seller confirmed shipped (proof uploaded)
COMPLETED  → No dispute raised after disputeDeadline → seller settled
DISPUTED   → Buyer raised dispute; jury voting in progress
REFUNDED   → Buyer/redeemer won dispute → receives refund
EXPIRED    → Redeem window closed, no redeemer claims
CANCELLED  → Seller cancelled before buyer
```

**Core Functions:**

| Function | Caller | Input | Behavior | Status Transition |
|----------|--------|-------|----------|-------------------|
| `createListing(tokenId, seller, price, redeemStart, redeemEnd)` | MarketCollection (PHYGITAL mint) | Token details + redeemStart/End | Create listing; lock collateral; status=ACTIVE; redeemEnd must be > now | — → ACTIVE |
| `buyPhygital(listingId)` | Buyer | Listing ID + payment | Pay exact price; buyer=msg.sender; transfer token; redeemer cleared | ACTIVE → SOLD |
| `redeemPhygital(listingId, shippingInfoJSON)` | Token holder | Listing ID + encrypted shipping info | Verify time in [redeemStart, redeemEnd); lock NFT; hash shipping info; record hash+URI; set voteDeadline = now + votePeriod | SOLD → REDEEMED |
| `confirmShipped(listingId, proofURI)` | Seller | Listing ID + proof (photo/tracking) | Record shipping proof URI; set shippingDeadline = now + disputePeriod | REDEEMED → SHIPPED |
| `settleShipping(listingId)` | Anyone | Listing ID | After disputeDeadline passed & status=SHIPPED: payout seller (price - collateral - 2% fee) + release collateral; dispatchSettleEvent; status=COMPLETED | SHIPPED → COMPLETED |
| `expireShipping(listingId)` | Redeemer/Buyer | Listing ID | If past shippingDeadline (seller didn't ship in time): refund buyer; slash seller collateral (lock in treasury); status=REFUNDED | REDEEMED/SHIPPED → REFUNDED |
| `raiseDispute(listingId, evidenceHash, evidenceURI, feeAmount)` | Redeemer | Listing ID + evidence hash/URI + fee | Charge 5% fee; call juryDAO.openCase(); set case ID on listing; status=DISPUTED | REDEEMED/SHIPPED → DISPUTED |
| `executeVerdict(listingId, buyerWins)` | JuryDAO only | Listing ID + verdict | If buyerWins: refund buyer; unlock token → ACTIVE; else: release collateral to seller; burn token; status = REFUNDED/COMPLETED | DISPUTED → REFUNDED or COMPLETED |
| `expireRedeemWindow(listingId)` | Anyone | Listing ID | If past redeemEnd and still ACTIVE (no one redeemed): seller withdraws; status=EXPIRED | ACTIVE → EXPIRED |
| `publishEncryptionPubkey(pubkey)` | Seller | NaCl X25519 pub key (string) | Store seller's encryption key so buyer can encrypt shipping details |  — |
| `calcCollateral(price)` | Anyone (view) | Token price | Return 50% of price (collateral amount) |  — |
| `calcDisputeFee(price)` | Anyone (view) | Token price | Return 5% of price (dispute opening cost) |  — |
| `getListingByToken(tokenId)` | Anyone (view) | Token ID | Return Listing struct |  — |

---

### 4. **JuryDAO** — Decentralized Dispute Resolution

**Purpose:** Manage juror pool, random juror selection, direct voting, and reward distribution for dispute resolution.

**Key Variables:**
- `nextCaseId` — auto-increment case ID counter
- `jurorPool[]` — array of registered juror addresses
- `_jurorIndex[address]` → 1-based index into jurorPool (for fast removal)
- `jurors[address]` → Juror struct (stakedAmount, casesServed, correctVotes, stakedAt, unlockAt, cooldownUntil, lifetimeSlash, active)
- `cases[caseId]` → Case struct (buyer, seller, challenger, jurors[3], votesForBuyer, votesForSeller, voteCount, openedAt, voteDeadline, status)
- `listingCaseId[listingId]` → mapping to find case by listing
- `_votes[caseId][juror]` → Vote enum (NONE, FOR_BUYER, FOR_SELLER)
- `_hasVoted[caseId][juror]` → bool tracking if juror voted
- `_rewardClaimed[caseId][juror]` → bool tracking if reward claimed
- `rewardPool[caseId]` → accumulated reward pool (dispute fee) for case
- `_activeJurorCases[juror]` → count of active cases assigned to juror
- `minStake = 100 TRUST` — min stake to register
- `votePeriod = 2 days` — voting window
- `stakeLockPeriod = 7 days` — how long stake is locked after registration
- `rejoinCooldown = 3 days` — cooldown after unregistering before re-registering
- `slashedStakeTreasury` — accumulated slashed stakes

**Core Functions:**

| Function | Caller | Input | Behavior | Notes |
|----------|--------|-------|----------|-------|
| `registerJuror()` | Juror candidate | None (uses minStake) | Transfer minStake to contract; add to jurorPool; set active=true; unlockAt = now + stakeLockPeriod | Can't register if already active or in cooldown |
| `unregisterJuror()` | Active juror | None | Check no active cases; check stake unlocked; pop from jurorPool; transfer minStake back; set cooldownUntil | Must wait for stake lock to expire |
| `openCase(listingId, buyer, seller, challenger, fee, evidenceHash, evidenceURI)` | PhygitalEscrow only | Listing + case details | Select 3 random jurors (Fisher-Yates shuffle + prevrandao); create Case struct; set voteDeadline = now + votePeriod; increment casesServed for each juror | Returns caseId; emits CaseOpenedFull |
| `submitCounterEvidence(caseId, evidenceHash, evidenceURI)` | Seller | Case ID + counter-evidence | Store seller's evidence on-chain; only callable if case OPEN & haven't submitted yet | Allows seller to defend before jury votes |
| `castVote(caseId, voteForBuyer, reason)` | Assigned juror | Case ID + vote direction + text reason | Mark hasVoted; increment votesForBuyer or votesForSeller; emit VoteCast | Auto-finalizes if majority (2/3) or all 3 voted |
| `finalizeVerdict(caseId)` | Anyone | Case ID | After voteDeadline passed: finalize vote count: if votesForBuyer ≥ 2 → buyer wins (RESOLVED); else if votesForSeller ≥ 2 → seller wins (RESOLVED); else → buyer wins default (DEFAULTED) | Decrement activeJurorCases; call phygitalEscrow.executeVerdict() |
| `claimReward(caseId)` | Juror who voted correctly | Case ID | Calculate reward = rewardPool / winnerCount; transfer reward; mark claimed | Only jurors who voted with majority get reward |
| `getCase(caseId)` | Anyone (view) | Case ID | Return full Case struct | — |
| `hasVoted(caseId, juror)` | Anyone (view) | Case ID, juror address | Return bool | — |
| `isRewardClaimed(caseId, juror)` | Anyone (view) | Case ID, juror address | Return bool | — |
| `jurorPoolSize()` | Anyone (view) | None | Return jurorPool.length | — |

**Juror Selection Algorithm:**
1. Verify at least 3 active jurors in pool
2. Fisher-Yates shuffle with seed = keccak256(prevrandao, timestamp, buyer, seller, poolSize)
3. Select first 3 candidates where candidate != buyer AND candidate != seller
4. If < 3 found, revert NotEnoughJurors

**Vote Verdict Logic:**
```
If votesForBuyer ≥ 2:
  → Buyer wins (RESOLVED); jurors who voted FOR_BUYER get rewards
Else if votesForSeller ≥ 2:
  → Seller wins (RESOLVED); jurors who voted FOR_SELLER get rewards
Else (0-1 votes each):
  → Buyer wins DEFAULT (DEFAULTED); reward pool goes unclaimed
```

---

## Business Logic & Workflows

### **Workflow A: NORMAL Token — Simple Marketplace**

```
1. Creator creates Set
   → CallSM: createSet(metadataURI)
   → MarketCollection: nextSetId++, store Set, emit SetCreated
   → Creator receives setId

2. Creator mints NORMAL token with price
   → Call: mintNormal(setId, tokenURI, price, traits[])
   → MarketCollection: verify creator owns Set, store TokenInfo with state=LISTED or ACTIVE
   → If price > 0: auto-create NormalListing
   → Emit TokenMinted, NormalTokenListed

3. Buyer purchases NORMAL token
   → Call: buyNormalToken(listingId) + msg.value = price
   → MarketCollection: verify listing active, transfer token to buyer
   → Calculate 2% platform fee, payout seller = price - fee
   → Update state to ACTIVE (sold)
   → Emit NormalTokenSold

4. [Optional] New owner re-lists token
   → Call: listNormalToken(tokenId, newPrice)
   → MarketCollection: state ACTIVE → LISTED, update price
   → Emit NormalTokenListed
```

**Key Points:**
- No escrow, no shipping, no disputes
- Platform takes 2% fee per sale
- Instant ownership transfer upon purchase

---

### **Workflow B: PHYGITAL Token — Escrow-Backed Trading**

#### **Phase 1: Minting & Listing**

```
1. Creator mints PHYGITAL token (with collateral)
   → Call: mintPhygital(setId, tokenURI, price, redeemStart, redeemEnd, traits[]) + msg.value = 50% of price
   → MarketCollection: store TokenInfo with state=LISTED, tokenType=PHYGITAL
   → Forward collateral + token details to PhygitalEscrow.createListing()
   → PhygitalEscrow: store Listing with status=ACTIVE, lock collateral
   → Emit TokenMinted, ListingCreated

2. [Optional] Seller publishes encryption pub key
   → Call: PhygitalEscrow.publishEncryptionPubkey(naclX25519PubKey)
   → Store seller's pub key for buyer to encrypt shipping details
   → Emit EncryptionPubkeyPublished
```

#### **Phase 2: Purchase & Redeem**

```
3. Buyer purchases PHYGITAL token
   → Call: PhygitalEscrow.buyPhygital(listingId) + msg.value = exact price
   → PhygitalEscrow: transfer token to buyer, store buyer address, status = SOLD
   → Emit ItemPurchased

4. Buyer redeems (within [redeemStart, redeemEnd] window)
   → Call: PhygitalEscrow.redeemPhygital(listingId, encryptedShippingInfoJSON)
   → PhygitalEscrow:
     * Verify time in [redeemStart, redeemEnd] window
     * Hash shipping info (keccak256)
     * Lock token via MarketCollection.lockToken() → state=LOCKED
     * Store shippingInfoHash + shippingInfoURI
     * Set shippingDeadline = now + 14 days
     * status = REDEEMED
   → MarketCollection: token state LOCKED (can't transfer)
   → Emit ItemRedeemed
```

#### **Phase 3: Shipping & Settlement (Happy Path)**

```
5. Seller confirms shipped
   → Call: PhygitalEscrow.confirmShipped(listingId, proofURI)
   → PhygitalEscrow: store proof URI, set disputeDeadline = now + 14 days
   → status = SHIPPED
   → Emit ShippingConfirmed

6. [Option A] Buyer passively settles (no action needed)
   → After disputeDeadline passed, anyone can call: PhygitalEscrow.settleShipping(listingId)
   → PhygitalEscrow:
     * Calculate payout = price - collateral - 2% platform fee
     * Transfer fee to accumulatedFees
     * Transfer payout to seller
     * Burn token via MarketCollection.burnToken() → state=BURNED
     * status = COMPLETED
   → Emit ListingSettled
```

#### **Phase 4: Dispute Path**

```
6. [Option B] Buyer raises dispute (within disputeDeadline, before settled)
   → Call: PhygitalEscrow.raiseDispute(listingId, evidenceHash, evidenceURI, feeAmount)
   → PhygitalEscrow:
     * Verify time within disputeDeadline
     * Charge 5% of price as dispute fee (msg.value must equal fee)
     * Call JuryDAO.openCase() + pass fee to rewardPool
     * Store case ID on listing
     * status = DISPUTED
   → JuryDAO:
     * Select 3 random jurors (not buyer or seller)
     * Create Case with voteDeadline = now + 2 days
     * status = OPEN
     * Emit CaseOpenedFull
   → Emit DisputeOpened

7. [Option B1] Seller submits counter-evidence (before jury votes)
   → Call: JuryDAO.submitCounterEvidence(caseId, evidenceHash, evidenceURI)
   → JuryDAO: store seller's counter-evidence on-chain
   → Emit CounterEvidenceSubmitted

8. [Option B2] Jurors vote (within voteDeadline)
   → Call: JuryDAO.castVote(caseId, voteForBuyer, reason)
   → JuryDAO:
     * Verify assigned to case & haven't voted
     * Mark vote; increment votesForBuyer or votesForSeller
     * If votesForBuyer ≥ 2 OR votesForSeller ≥ 2 OR voteCount == 3: auto-finalize
     * Emit VoteCast

   → If auto-finalized or after voteDeadline passed:
     * Call JuryDAO.finalizeVerdict(caseId)
     * JuryDAO: calculate buyerWins = (votesForBuyer ≥ 2)
     * Call PhygitalEscrow.executeVerdict(listingId, buyerWins)
     * Emit VerdictFinalized

9. [Option B2a] Buyer wins dispute
   → PhygitalEscrow.executeVerdict(listingId, true):
     * Refund buyer = price + dispute fee (collected)
     * Unlock token via MarketCollection.unlockToken() → state=ACTIVE
     * Slash seller collateral to JuryDAO.slashedStakeTreasury
     * status = REFUNDED
   → Emit VerdictExecuted

10. [Option B2b] Seller wins dispute
    → PhygitalEscrow.executeVerdict(listingId, false):
      * Release seller collateral to seller
      * Burn token via MarketCollection.burnToken() → state=BURNED
      * status = COMPLETED
    → Emit VerdictExecuted

11. Winning jurors claim rewards
    → Call: JuryDAO.claimReward(caseId)
    → JuryDAO: verify voted correctly, transfer reward = rewardPool / winnerCount
    → Emit RewardClaimed
```

#### **Phase 4 Alternative: Shipping Timeout**

```
6. [Option C] Buyer/Redeemer claims timeout refund (seller didn't ship)
   → Call: PhygitalEscrow.expireShipping(listingId)
   → PhygitalEscrow:
     * Verify past shippingDeadline (14 days after redeem)
     * Refund buyer = price
     * Slash seller collateral to JuryDAO.slashedStakeTreasury
     * Unlock token → state=ACTIVE
     * status = REFUNDED
   → Emit ShippingExpired
```

---

### **Workflow C: Juror Lifecycle**

```
1. Potential juror stakes $TRUST to register
   → Transfer minStake (100 TRUST) to JuryDAO
   → Call: JuryDAO.registerJuror()
   → JuryDAO: add to jurorPool, set active=true, unlockAt = now + 7 days
   → Emit JurorRegistered

2. Juror assigned to dispute cases randomly
   → JuryDAO.openCase() selects 3 jurors using Fisher-Yates + prevrandao
   → Jurors are notified (off-chain) and check JuryPage UI

3. Juror casts vote(s) on assigned cases
   → Call: JuryDAO.castVote(caseId, voteForBuyer, reason)
   → Vote recorded; reward pool eligible if voted with majority

4. Juror claims reward (if voted correctly)
   → Call: JuryDAO.claimReward(caseId)
   → Receive share of dispute fee rewardPool
   → Can claim per-case multiple times

5. [Optional] Juror unregisters (after stake lock expires)
   → Wait until unlockAt > now
   → Call: JuryDAO.unregisterJuror()
   → Stake returned; set cooldownUntil = now + 3 days
   → Emit JurorUnregistered

6. Cannot re-register until cooldown expires
   → If attempt: revert CooldownActive(cooldownUntil)
```

---

## Key Features

### **1. Token Types & State Management**

| Type | Use Case | Flow | Transfers |
|------|----------|------|-----------|
| **NORMAL** | Collectible NFTs | Create Set → Mint → List → Buy → Own | Free (after purchased) |
| **PHYGITAL** | Physical goods | Create Set → Mint (w/ collateral) → Redeem (lock) → Ship → Settle/Dispute | Buyer gets token upon purchase; locked during redeem |

### **2. Escrow & Collateral System**

- **Seller Collateral:** 50% of item price locked at minting; released upon completed delivery or slashed if dispute lost
- **Dispute Fee:** 5% of price charged from buyer; becomes reward pool for winning jurors
- **Platform Fees:** 2% taken from Normal sales + Phygital settlements

### **3. Direct Voting (No Commit-Reveal)**

- Jurors vote immediately in single transaction
- Case auto-finalizes when majority reached (2/3) or all 3 voted
- Fallback: `finalizeVerdict()` can be called after `voteDeadline` passes

### **4. Random Juror Selection**

- Uses Fisher-Yates shuffle algorithm
- Randomness source: `block.prevrandao` (Ethereum beacon state) + timestamp + buyer/seller addresses
- Guarantees: excludes buyer & seller; selects 3 unique jurors; requires min 3 in pool

### **5. Passive Settlement**

- Buyer does NOT need to confirm delivery
- If seller shipped & no dispute raised within 14 days: automatic settlement
- Seller cashes out; token burned

### **6. Seller Counter-Evidence**

- Seller can submit alternative evidence before jury finalizes verdict
- Enables fair arbitration: jury sees both sides
- Stored on-chain; evidence URI can point to IPFS JSON with message + file

### **7. On-Chain Traits**

- Per-token up to 20 key-value attributes
- Immutable once set
- Indexed for filtering/search

### **8. UUPS Upgradeable Contracts**

- All contracts inherit from `UUPSUpgradeable`
- Admin can upgrade implementation (preserves proxy address & storage)
- Storage gap (`uint256[31]` or `uint256[50]`) reserves slots for future vars

### **9. Access Control**

- **DEFAULT_ADMIN_ROLE:** Contract owner/deployer
- **ESCROW_ROLE:** PhygitalEscrow contract granted access to lock/burn/transfer tokens in MarketCollection
- **OnlyOwner:** TrustToken mint, JuryDAO admin functions, PhygitalEscrow admin

---

## Deployment & Configuration

### **Local Hardhat Deployment**

```bash
cd contracts
npx hardhat compile
npx hardhat node
npx hardhat run scripts/deploy.ts --network localhost
```

**Auto-Seeds 3 Jurors:**
- Accounts #3, #4, #5 each receive 100 TRUST
- All 3 register as jurors immediately
- Dispute test cases can be opened right away

### **Environment Variables**

**Frontend (.env):**
```
VITE_MARKET_COLLECTION_ADDRESS=0x...
VITE_PHYGITAL_ESCROW_ADDRESS=0x...
VITE_JURY_DAO_ADDRESS=0x...
VITE_TRUST_TOKEN_ADDRESS=0x...
VITE_WALLETCONNECT_PROJECT_ID=...
```

---

## Gas Optimization & Constraints

### **Storage Optimizations**

- ERC1155 for multi-token support in single contract
- Trait array stored separately to reduce per-token storage
- Juror removal via swap-and-pop (O(1) removal)
- Minimal state reads in voting loop

### **Transaction Limits**

- Max 3 jurors per case (fixed array `address[3]`)
- Max 20 traits per token
- Case data fits in 2-3 storage slots
- Voting constraints enforced in `castVote()` call checks

---

## Summary Table

| Contract | Role | Upgrade model | Key Contracts Called |
|----------|------|----------------|---------------------|
| **TrustToken** | Staking & governance | UUPS (owner) | None |
| **MarketCollection** | NFT registry & Normal marketplace | UUPS (owner) | PhygitalEscrow (via escrowTransfer) |
| **PhygitalEscrow** | Escrow & shipping orchestration | UUPS (owner) | MarketCollection (lock/burn/unlock), JuryDAO (openCase/executeVerdict) |
| **JuryDAO** | Dispute resolution & voting | UUPS (owner) | PhygitalEscrow (executeVerdict), TrustToken (transfer) |

---

**Generated:** TrustMarket Development Team
**Last Updated:** March 17, 2026
