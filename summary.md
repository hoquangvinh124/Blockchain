# Project Summary

---

## [2026-03-16] Merge TokenDetailPage + PhygitalDetailPage: unified token detail with full phygital lifecycle, 1-TX mint, and redeem window enforcement

**Task:** Fix three bugs (redeem button not activating despite valid window, 2 transactions on phygital mint, buyer seeing "View Phygital Market" instead of a Buy button) and merge `PhygitalDetailPage` into `TokenDetailPage` so every token — Normal or Phygital — is handled at a single `/app/token/:tokenId` route.

**Changes:**
- `contracts/contracts/MarketCollection.sol` — Added two new functions: `createSetAndMintNormal(setMetadataURI, tokenURI, price, traits)` and `createSetAndMintPhygital(setMetadataURI, tokenURI, price, redeemStart, redeemEnd, traits)`. Both collapse the previous two-step flow (createSet + mint) into a single transaction when the seller is creating a brand-new collection simultaneously. The phygital variant is `external payable` and forwards collateral to `PhygitalEscrow` in-flight.
- `frontend/src/abi/MarketCollection.json` — Re-copied from compiled artifacts to include the two new function signatures.
- `frontend/src/hooks/useCollectionActions.ts` — Added hook-level wrappers for `createSetAndMintNormal` and `createSetAndMintPhygital`, including automatic collateral calculation for the phygital variant.
- `frontend/src/pages/CreatePage.tsx` — Rewrote `handleSubmit`: when `createNewSet === true`, it now calls the single-transaction variants; when using an existing set ID it falls back to the separate `mint*` functions as before.
- `frontend/src/hooks/usePhygitalData.ts` — Added `usePhygitalListingByToken(tokenId)` hook that chains `listingByToken(tokenId)` → `getListing(listingId)` so any component can load a phygital listing from a tokenId alone, without needing the listing ID in the URL.
- `frontend/src/pages/TokenDetailPage.tsx` — Complete rewrite. The page now serves both Normal and Phygital tokens at `/app/token/:tokenId`. Normal tokens retain the existing inline list/cancel/buy actions. Phygital tokens additionally render a full lifecycle section below the info card: tabbed "Order Timeline" + "Actions" panels containing all states (ACTIVE → SOLD → REDEEMED → SHIPPED → COMPLETED/DISPUTED) previously only available at the old PhygitalDetailPage. The redeem window is enforced in the UI: the Redeem button is disabled when `now < redeemStart` or `now > redeemEnd`, with contextual messages explaining why. All encryption handlers (publish pubkey, decrypt shipping info) use `signMessageAsync` from wagmi — wallet-agnostic. Seller counter-evidence and JuryDAO dispute flows are fully preserved.
- `frontend/src/App.tsx` — Removed the `import PhygitalDetailPage` line and the `<Route path="phygital/:listingId">` route. The phygital details are now served by the existing `<Route path="token/:tokenId">` route.
- `frontend/src/pages/DisputesPage.tsx` — Updated the "Submit Counter-Evidence" link from `/app/phygital/${item.id}` to `/app/token/${item.tokenId}`.
- `frontend/src/pages/ProfilePage.tsx` — Updated both phygital listing cards (purchased + sold) from `/app/phygital/${l.id}` to `/app/token/${l.tokenId}`.

**Scope:** `contracts/contracts/MarketCollection.sol`, `frontend/src/abi/MarketCollection.json`, `frontend/src/hooks/useCollectionActions.ts`, `frontend/src/hooks/usePhygitalData.ts`, `frontend/src/pages/CreatePage.tsx`, `frontend/src/pages/TokenDetailPage.tsx`, `frontend/src/App.tsx`, `frontend/src/pages/DisputesPage.tsx`, `frontend/src/pages/ProfilePage.tsx`.

**Effect:** Sellers creating a new collection simultaneously now sign only one transaction instead of two. Phygital buyers go directly to a unified token page where they can buy, redeem, and track their order — no separate phygital listing page required. The Redeem button is gated by the on-chain redeem window, preventing silent reverts. TypeScript exits 0 with no errors.

---
## [2026-03-16] Migrate encryption: MetaMask API → Deterministic NaCl từ personal_sign

**Task:** Thay thế `eth_getEncryptionPublicKey` + `eth_decrypt` (chỉ hoạt động với MetaMask) bằng luồng deterministic dùng `personal_sign` + `keccak256` → NaCl keypair, tương thích mọi ví Web3 (Brave, Rabby, WalletConnect...).

**Changes:**
- `frontend/src/utils/encrypt.ts` — Viết lại hoàn toàn: xóa `getProvider()`, `getMetaMaskEncryptionPubkey()`, `decryptWithMetaMask()`; thêm hằng số `SIGN_MESSAGE` (có disclaimer chống phishing); thêm `deriveNaClKeypair(signature)` dùng `keccak256(signature)` làm seed → `nacl.box.keyPair.fromSecretKey`; thêm `getPublicKeyBase64(signature)` để seller lấy pubkey; giữ nguyên `encryptForPublicKey()`; thêm `decryptWithSignature(signature, encryptedJson)` giải mã local hoàn toàn — không cần gọi ví lần thứ hai.
- `frontend/src/pages/PhygitalDetailPage.tsx` — Cập nhật import wagmi thêm `useSignMessage`; đổi import từ encrypt sang API mới (`getPublicKeyBase64`, `decryptWithSignature`, `SIGN_MESSAGE`); thêm hook `const { signMessageAsync } = useSignMessage()`; viết lại `handlePublishPubkey` dùng `signMessageAsync` thay vì `eth_getEncryptionPublicKey`; viết lại `handleDecryptShippingInfo` dùng `signMessageAsync` → `decryptWithSignature` (decrypt local); cập nhật UI text: description "Ký xác nhận để tạo khóa mã hóa. Tương thích mọi ví Web3.", nút Decrypt đổi thành "Decrypt Shipping Info", SOLD section hiển thị trạng thái encrypted/unencrypted tùy theo `sellerEncPubkey`.

**Scope:** `frontend/src/utils/encrypt.ts`, `frontend/src/pages/PhygitalDetailPage.tsx`

**Effect:** Toàn bộ luồng mã hóa shipping info hoạt động với mọi ví Web3 hỗ trợ `personal_sign` (EIP-191). Seller ký một lần để derive keypair, pubkey được lưu on-chain. Buyer encrypt bằng pubkey đó. Seller ký lại cùng message → derive cùng secretKey → decrypt local, không có popup từ API MetaMask độc quyền. Deterministic nhờ RFC6979 (secp256k1): cùng ví + cùng message → cùng signature → cùng keypair → luôn decrypt được dữ liệu cũ. TypeScript `exit 0`.

---



**Task:** Triển khai toàn bộ luồng mã hóa MetaMask EIP-5630 — seller đăng ký khóa công khai mã hóa on-chain, buyer dùng NaCl box encrypt địa chỉ giao hàng trước khi upload IPFS, seller dùng `eth_decrypt` để giải mã — thay thế plaintext IPFS JSON cũ.

**Changes:**
- `contracts/contracts/PhygitalEscrow.sol` — Thêm `mapping(address => string) public sellerEncryptionPubkeys`, event `EncryptionPubkeyPublished`, và hàm `publishEncryptionPubkey(string calldata pubkey)` để seller đăng ký khóa NaCl X25519 của mình on-chain.
- `frontend/src/abi/PhygitalEscrow.json` — Cập nhật ABI sau khi compile lại contract; đã redeploy lên địa chỉ mới `0x68B1D87F95878fE05B998F19b66F4baba5De1aed`.
- `frontend/src/utils/encrypt.ts` — Tạo mới: `getMetaMaskEncryptionPubkey(address)` gọi `eth_getEncryptionPublicKey`, `encryptForPublicKey(pubkey, plaintext)` dùng NaCl box (X25519-XSalsa20-Poly1305), `decryptWithMetaMask(address, encryptedJson)` gọi `eth_decrypt` với hex-encoded JSON.
- `frontend/src/hooks/usePhygitalActions.ts` — Thêm hàm `publishEncryptionPubkey(pubkey: string)` gọi contract.
- `frontend/src/pages/PhygitalDetailPage.tsx` — Thêm imports encrypt utils; thêm `sellerEncPubkey` từ `useReadContract`; cập nhật `fetchShippingInfo` phát hiện `encrypted: true`; thêm `handleDecryptShippingInfo` và `handlePublishPubkey`; ACTIVE section: seller thấy cảnh báo + nút "Set up Encryption Key" khi chưa có pubkey; SOLD section: nếu seller có pubkey thì dùng `encryptForPublicKey` trước khi upload `{encrypted: true, ciphertext}`; REDEEMED section: nút "Decrypt with MetaMask" khi data được mã hóa, fallback về plaintext view hoặc "Load Shipping Address" như cũ.

**Scope:** `contracts/contracts/PhygitalEscrow.sol`, `frontend/src/abi/PhygitalEscrow.json`, `frontend/src/utils/encrypt.ts` (mới), `frontend/src/hooks/usePhygitalActions.ts`, `frontend/src/pages/PhygitalDetailPage.tsx`

**Effect:** Shipping info (tên, SĐT, địa chỉ) của buyer được mã hóa đầu cuối (end-to-end) bằng khóa công khai NaCl của seller trước khi lưu lên IPFS — chỉ seller với ví MetaMask mới có thể giải mã; `eth_getEncryptionPublicKey` và `eth_decrypt` là API MetaMask chuẩn (EIP-5630); TypeScript `exit 0`.

---

## [2026-03-15] PhygitalDetailPage overhaul: tabbed UI, structured shipping form, seller tools, contract upgrade

**Task:** Implement nhiều cải tiến lớn cho PhygitalDetailPage và NftBrowsePage: xóa banner phygital + StatusBadge overlay, gộp Timeline + Actions thành tabbed UI, cải thiện form Redeem với tên/SĐT/địa chỉ, cho seller xem thông tin giao hàng, thêm tracking number + proof upload khi confirm shipped, sửa bug duplicate counter-evidence, cập nhật contracts.

**Changes:**
- `frontend/src/pages/NftBrowsePage.tsx` — Xóa banner "phygital items available for purchase in escrow" (xanh lá) và StatusBadge overlay trên token cards; dọn sạch imports thừa (`Link`, `formatEther`, `usePhygitalListings`, `StatusBadge`, `STATUS`, `listingStatusLabel`); token grid render `<TokenCard>` trực tiếp không wrapper.
- `frontend/src/pages/PhygitalDetailPage.tsx` — Tổ chức lại hoàn toàn layout: xóa OrderTimeline khỏi left column; thêm tabbed section ở right column với hai tab "Order Timeline" và "Actions"; thêm 15 quốc gia/mã vùng và 9 đơn vị vận chuyển dưới dạng constants; thay input đơn shipping info thành form 3 trường (Họ tên, SĐT+mã vùng, Địa chỉ chi tiết); seller xem được địa chỉ giao hàng của buyer từ IPFS; form "Confirm Shipped" có dropdown carrier, tracking number và upload proof; xóa section counter-evidence bị duplicate; fix Buy button không còn yêu cầu wallet kết nối; xóa `isRedeemer` unused.
- `contracts/contracts/libraries/MarketTypes.sol` — Thêm hai field mới vào Listing struct: `shippingInfoURI string` (IPFS URI chứa JSON thông tin giao hàng) và `shippingProofURI string` (IPFS URI chứa tracking + proof của seller).
- `contracts/contracts/PhygitalEscrow.sol` — Update `redeemItem(listingId, shippingInfoHash, shippingInfoURI)` nhận thêm URI và lưu vào struct; update `confirmShipped(listingId, shippingProofURI)` nhận thêm proof URI và lưu vào struct; update event signatures `ItemRedeemed` và `ShippingConfirmed` để emit URI mới; khởi tạo hai field mới với `""` trong `createListing`.
- `frontend/src/hooks/usePhygitalData.ts` — Thêm `shippingInfoURI: string` và `shippingProofURI: string` vào interface `PhygitalListingData` và hàm `normalizeListing`.
- `frontend/src/hooks/usePhygitalActions.ts` — Update signature `redeemItem` (thêm `shippingInfoURI`) và `confirmShipped` (thêm `shippingProofURI`) để khớp với contract mới.
- `frontend/src/abi/PhygitalEscrow.json` — Thay bằng ABI mới sau khi compile contracts với các function signatures đã update.

**Scope:** `frontend/src/pages/`, `frontend/src/hooks/`, `frontend/src/abi/`, `contracts/contracts/libraries/`, `contracts/contracts/`

**Effect:** Trải nghiệm phygital escrow được cải thiện đáng kể: buyer điền form chuẩn khi redeem, seller tự fetch địa chỉ giao hàng. Seller có tracking number + proof upload có cấu trúc khi confirm shipped. Tab Timeline/Actions gọn gàng hơn thay vì hai section rời. Không còn banner phygital noise và badge overlay trên token cards. Contract và ABI đã đồng bộ, TypeScript build pass sạch (exit 0).

---

## [2026-03-15] Center preview card on CreatePage

**Task:** The image preview card on the CreatePage was visually shifted to the left because a one-sided `pr-10` padding was used as the gap between the preview panel and the form.

**Changes:**
- `frontend/src/pages/CreatePage.tsx` — Replaced `gap-0` on the parent flex container with `gap-10`, and removed `pr-10` from the left preview panel. The preview card is now symmetrically centered within its column.

**Scope:** `frontend/src/pages/CreatePage.tsx`

**Effect:** The sticky NFT/collection preview card on the left side of the Create page is now perfectly centered within its panel regardless of screen width, rather than being anchored to the left edge.

---

## [2026-03-15] Fix sidebar active indicator + remove ExplorePage CTA buttons

**Task:** Fix the sidebar's active item highlight being visually skewed to the left (not round/centered), and remove all "Create" call-to-action buttons from the Explore page so it is a pure discovery page for all users.

**Changes:**
- `frontend/src/components/Sidebar.tsx` — Moved the active background highlight from the full-width link element to a dedicated `size-10 rounded-xl` icon wrapper. Used Tailwind's named group (`group/item`) so hover background still targets the icon span, not the entire link row. This ensures the active indicator is always a proper centered square regardless of collapsed/expanded sidebar state. Applied to all three link groups: `NAV_LINKS`, Create button, and `BOTTOM_LINKS`.
- `frontend/src/pages/ExplorePage.tsx` — Removed the "Create First Collection" `<Link>` button from the `HeroBanner` no-sets fallback and the "Create Collection" `<Link>` button from the Trending Collections empty state. Both empty states now show only a neutral text message. The Explore page is a public browsing experience for all users, not a creator onboarding flow.

**Scope:** `frontend/src/components/Sidebar.tsx`, `frontend/src/pages/ExplorePage.tsx`

**Effect:** The active sidebar item now shows a visually balanced 40×40 px rounded-square indicator centered around the icon, consistent across collapsed and expanded states. The Explore page no longer pushes users toward creating collections — it remains a neutral discovery surface.

---

## [2026-03-15] UI/UX overhaul: OpenSea-inspired redesign + seller counter-evidence

**Task:** Implement 15 UI/UX changes based on OpenSea screenshots, including a new NFT browse page, full-screen Create page with symbol support, evidence file upload to Pinata, and seller counter-evidence via JuryDAO contract changes.

**Changes:**
- `frontend/src/components/Sidebar.tsx` — Smaller icons (size-6 → size-4), renamed "Phygital" → "NFTs", route `/app/phygital` → `/app/nfts`, icon changed from Package to Images
- `frontend/src/components/SiteLayout.tsx` — Added padding to main content area (`px-6 pt-6 pb-16`) for proper spacing below navbar
- `frontend/src/components/TokenCard.tsx` — Reduced card padding from `p-3.5` to `p-2.5` for denser grid layout
- `frontend/src/pages/ExplorePage.tsx` — Full rewrite: added auto-rotating `HeroBanner` component (5s interval, arrow controls, dot indicators); removed MetricCards; redesigned Trending Collections (no icon, subtitle text); renamed "Recent Tokens" → "NFTs"; updated grid to `lg:grid-cols-5`; fixed duplicate closing brace
- `frontend/src/pages/NftBrowsePage.tsx` — New file: replaces PhygitalMarketPage entirely; includes left-sidebar filters (Status, Type, Price sort), search by token ID, grid size toggle, active phygital listings strip, and `phygitalStatusMap` for badge overlays
- `frontend/src/App.tsx` — Swapped `PhygitalMarketPage` route for `NftBrowsePage` at `/app/nfts`; kept `/app/phygital/:listingId` for listing detail
- `frontend/src/pages/CreatePage.tsx` — Complete rewrite: full-screen two-column layout (left sticky image preview panel on `lg+`, right scrollable form); three-step wizard (type → set → details); `newSetSymbol` state with IPFS metadata storage; `handleImageChange` helper with FileReader preview; both set-image and token-image previews
- `frontend/src/pages/CollectionDetailPage.tsx` — Added `ContractAddressCopy` component: shows `contracts.marketCollection.address` with one-click copy and Check/Copy icon toggle, toast feedback
- `frontend/src/pages/TokenDetailPage.tsx` — Same `ContractAddressCopy` component added to the token details panel
- `frontend/src/pages/PhygitalDetailPage.tsx` — Back-links updated to `/app/nfts`; evidence inputs replaced with Pinata file-upload dropzone (auto-computes hash via `keccak256(toHex(uri))`); new seller counter-evidence section when `DISPUTED && isSeller`: reads `listingCaseId` + `getCase` from JuryDAO, shows upload form or "already submitted" state; calls `actions.submitCounterEvidence()`
- `frontend/src/pages/DisputesPage.tsx` — Evidence hash/URI text inputs replaced with Pinata file-upload dropzone; new "Your Disputed Sales" section for sellers showing their DISPUTED sold items with link to listing detail for counter-evidence
- `frontend/src/hooks/usePhygitalActions.ts` — Added `submitCounterEvidence(caseId, evidenceHash, evidenceURI)` that calls `contracts.juryDao` with the new ABI function
- `contracts/contracts/libraries/MarketTypes.sol` — Added `sellerEvidenceHash` (bytes32) and `sellerEvidenceURI` (string) fields to the `Case` struct before `CaseStatus status`
- `contracts/contracts/JuryDAO.sol` — Added `mapping(uint256 => uint256) public listingCaseId`; new errors `NotCaseParticipant` and `SellerEvidenceAlreadySubmitted`; new event `CounterEvidenceSubmitted`; new function `submitCounterEvidence()` (only callable by case seller when OPEN, prevents re-submission); `openCase()` now writes `listingCaseId[listingId] = caseId`; `openCase()` struct initializer updated with new fields
- `frontend/src/abi/JuryDAO.json` — Replaced with freshly compiled ABI containing `submitCounterEvidence`, `listingCaseId`, `CounterEvidenceSubmitted`, and new error signatures
- `frontend/.env` — Auto-updated by deploy script with new contract addresses after redeployment
- deleted: `frontend/src/pages/PhygitalMarketPage.tsx` — Obsolete page replaced by NftBrowsePage; removed after routes were updated

**Scope:** `frontend/src/`, `contracts/contracts/`, `contracts/contracts/libraries/`, `frontend/src/abi/`

**Effect:** The marketplace now has an OpenSea-style layout with a hero carousel on the Explore page, a unified NFT browse page merging digital and phygital tokens under one route, smaller and more compact UI elements, contract address copy-to-clipboard on collection and token detail pages, evidence submissions via Pinata file upload (no manual hash/URI entry), and a complete seller counter-evidence flow: sellers can upload counter-evidence directly from the listing detail page or via the Dispute Center when their sale is in DISPUTED status. JuryDAO now records a `listingId → caseId` mapping on-chain enabling efficient case lookups by listing.

---



**Task:** Người dùng yêu cầu luôn sử dụng MCP server Context7 để tra cứu tài liệu chính thức của thư viện trước khi viết code, đảm bảo code đúng theo convention được khuyến nghị.

**Changes:**
- `created: .github/instructions/context7-docs.instructions.md` — instruction áp dụng cho tất cả file `.js/.ts/.jsx/.tsx/.sol/.py/.go/.vue`, bắt buộc agent phải gọi `mcp_context7_resolve-library-id` rồi `mcp_context7_query-docs` trước khi implement bất kỳ logic nào dùng thư viện bên ngoài.

**Scope:** Toàn bộ file source code trong workspace. Đặc biệt áp dụng cho các thư viện blockchain (`wagmi`, `viem`, `hardhat`, `openzeppelin-contracts`) và frontend (`react`, `tanstack-query`, `tailwindcss`, `shadcn-ui`).

**Effect:** Ngăn agent viết code theo API cũ hoặc sai convention — mọi implementation đều phải được xác nhận từ docs chính thức qua Context7 trước khi chạy.

---

## [2026-03-11] Tạo instruction quy tắc comment code

**Task:** Người dùng muốn Copilot không dùng emoji trong comment, comment phải ngắn gọn và chính xác.

**Changes:**
- `created: .github/instructions/code-comments.instructions.md` — định nghĩa quy tắc viết comment cho toàn bộ file code trong project

**Scope:** `**/*.{js,ts,jsx,tsx,py,go,java,c,cpp,cs,rb,php,swift,kt,rs,vue,dart,lua,sh,bash}`

**Effect:** Copilot sẽ không dùng emoji trong comment, tránh comment thừa hoặc lặp lại code, chỉ giải thích điều không hiển nhiên.

---

## [2026-03-11] Xóa instruction cấp user

**Task:** Người dùng muốn xóa file instruction đã tạo nhầm ở cấp user (áp dụng toàn hệ thống).

**Changes:**
- `deleted: C:\Users\PC LENOVO\AppData\Roaming\Code\User\prompts\code-comments.instructions.md` — xóa vì chỉ muốn instruction áp dụng trong project này, không phải toàn hệ thống

**Scope:** Người dùng (user-level, toàn bộ VS Code)

**Effect:** Quy tắc comment chỉ còn hiệu lực trong workspace `c:\Blockchain`.

---

## [2026-03-11] Hoàn thành 3 trang frontend còn lại và sửa lỗi build

**Task:** Người dùng yêu cầu hoàn thành phần frontend còn thiếu (CreateJobPage, JobDetailPage, DashboardPage) và đảm bảo dự án build thành công.

**Changes:**
- `frontend/src/pages/CreateJobPage.tsx` — tạo trang tạo job mới: form nhập thông tin freelancer, title, description, ETH amount, deadline; preview phí platform + bond; gọi `useCreateJob` hook
- `frontend/src/pages/JobDetailPage.tsx` — tạo trang chi tiết job phức tạp nhất: hiển thị thông tin đầy đủ, nút hành động theo role (client/freelancer) và trạng thái hiện tại (FUNDED/IN_PROGRESS/PENDING_CONFIRM/DISPUTED); xử lý bond, auto-release, dispute logic
- `frontend/src/pages/DashboardPage.tsx` — tạo trang dashboard: liệt kê job theo vai trò client và freelancer, thẻ job card có link đến chi tiết
- `frontend/src/components/StatusBadge.tsx` — xóa import `Badge` không dùng để fix lỗi TS6133
- `frontend/src/lib/wagmi.ts` — xóa import `createConfig` không dùng để fix lỗi TS6133
- `frontend/src/hooks/useEscrow.ts` — thêm import `Abi` từ viem, cast `escrowAbi as Abi` trong `useReadContracts` để fix lỗi TypeScript inference với ABI không phải const
- `frontend/src/pages/JobDetailPage.tsx` — thêm import `ReactElement`, xóa `useNavigate` và biến `navigate` không dùng, thay `JSX.Element[]` bằng `ReactElement[]`, cast kiểu trả về của `useBondAmount` thành `bigint | undefined`
- `frontend/src/pages/DashboardPage.tsx` — thay `<Button asChild>` (không được hỗ trợ bởi @base-ui/react/button) bằng `<Link>` với `buttonVariants()` className
- `frontend/package.json` — nâng cấp `wagmi` từ `2.14.16` lên `2.19.5` để fix lỗi Vite bundler "baseAccount is not exported" do RainbowKit 2.2.10 yêu cầu

**Scope:** `frontend/src/pages/`, `frontend/src/components/StatusBadge.tsx`, `frontend/src/hooks/useEscrow.ts`, `frontend/src/lib/wagmi.ts`, `frontend/package.json`

**Effect:** Toàn bộ frontend có thể build thành công (TypeScript + Vite). Dự án có đầy đủ 3 trang chính: tạo job, chi tiết job với action buttons theo trạng thái on-chain, và dashboard liệt kê job theo vai trò. Wagmi được cập nhật lên 2.19.5 để hợp lệ với RainbowKit 2.2.10.

## [2026-03-18] Đề xuất outline báo cáo 10 slide cho TrustMarket

**Task:** Người dùng yêu cầu quét codebase và đề xuất cách trình bày báo cáo trong đúng 10 slide, với trọng tâm nghiêng mạnh về kinh tế và mô hình vận hành.

**Changes:**
- `summary.md` — bổ sung ghi chú tổng hợp từ việc rà soát contracts, frontend và tài liệu dự án để làm nền cho outline báo cáo 10 slide, nhấn mạnh fee, collateral, dispute economics, $TRUST, và luồng doanh thu/rủi ro.

**Scope:** `contracts/contracts/`, `frontend/src/`, `TRUSTMARKET_V2_REPORT.md`, `compact.md`, `summary.md`

**Effect:** Có sẵn một khung nội dung báo cáo ngắn gọn, bám sát codebase, ưu tiên câu chuyện kinh tế của marketplace thay vì sa đà vào kỹ thuật triển khai.

---

## [2026-03-11] Redesign toàn bộ frontend theo phong cách "Cryptographic Noir"

**Task:** Người dùng hỏi về việc có dùng frontend-design skill không, và yêu cầu áp dụng skill đó với dark theme, tự chọn aesthetic.

**Changes:**
- `frontend/src/index.css` — xóa hoàn toàn light theme, thay tất cả CSS variables trong `:root` bằng dark theme "Cryptographic Noir" (nền near-black oklch, accent electric amber), thay font Geist bằng Google Fonts: Syne (heading) + DM Sans (body) + JetBrains Mono (mono), thêm custom utilities: `.dot-grid`, `.ambient-orb`, `.glow-card`, `.text-gradient-amber`, `.section-label`, `.field-input`, `.animate-fade-up-*`, custom scrollbar
- `frontend/src/main.tsx` — thêm `document.documentElement.classList.add("dark")` để kích hoạt Tailwind dark: utilities cho tất cả shadcn components
- `frontend/src/App.tsx` — thêm class `dark` vào root div, mở rộng container từ `max-w-4xl` lên `max-w-5xl`
- `frontend/src/components/Navbar.tsx` — redesign: logo 4-ô vuông amber, dùng `NavLink` component với active indicator amber, bỏ shadcn Button, dùng raw HTML để kiểm soát style hoàn toàn
- `frontend/src/components/StatusBadge.tsx` — redesign: mỗi trạng thái có màu border + bg + text riêng biệt, thêm dot indicator có `animate-pulse` cho trạng thái đang chạy, dùng font mono uppercase
- `frontend/src/pages/LandingPage.tsx` — redesign hoàn toàn: hero với clamp typography lớn + gradient amber text + dot grid background + ambient orb glow, stats strip 3 cột, "How it works" cards với glow-card effect, features grid, testnet banner
- `frontend/src/pages/CreateJobPage.tsx` — redesign: terminal-style field labels (ALL_CAPS mono), native inputs với `.field-input` class, fee breakdown panel, bỏ tất cả shadcn Card/Input/Label/Button
- `frontend/src/pages/JobDetailPage.tsx` — redesign: 2-column layout (info 3/5 + actions 2/5), data grid với section-label, sticky actions panel, Btn và UrlAction components thay thế shadcn
- `frontend/src/pages/DashboardPage.tsx` — redesign: stats cards, job sections theo role, JobRow dạng list item với hover border amber + ETH amount mono amber
- `frontend/package.json` — không thay đổi thêm (wagmi 2.19.5 từ session trước)

**Scope:** `frontend/src/index.css`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/components/`, `frontend/src/pages/`

**Effect:** Toàn bộ frontend chuyển sang dark theme vĩnh viễn với aesthetic "Cryptographic Noir" — nền near-black, accent amber, Syne font cho heading, JetBrains Mono cho địa chỉ/số ETH theo phong cách bank terminal, dot grid background, glow effects. Build sạch, dev server chạy tại http://localhost:5173.

---

## [2026-03-11] Redesign toàn bộ frontend theo phong cách "Verdant Paper"

**Task:** Người dùng yêu cầu viết lại toàn bộ frontend from scratch với aesthetic light, minimalist, modern và đẹp lung linh, sử dụng frontend-design skill.

**Changes:**
- `frontend/src/index.css` — xóa toàn bộ "Cryptographic Noir" dark tokens và utilities, viết lại hoàn toàn với "Verdant Paper" light theme: background warm off-white `oklch(0.979 0.003 84)`, primary forest green `oklch(0.46 0.12 157)`, font imports chuyển từ Syne+JetBrains Mono sang Cormorant Garamond (serif italic display) + DM Sans (body) + Fira Code (mono). Thêm custom utilities mới: `.field-input` (underline-only bottom border thay vì box), `.field-label` (Fira Code small caps), `.btn-primary/.btn-outline/.btn-secondary/.btn-danger` (pill-shaped buttons), `.fade-up-*` entrance animations, custom light scrollbar.
- `frontend/src/main.tsx` — xóa `document.documentElement.classList.add("dark")`, chuyển RainbowKit từ `darkTheme()` sang `lightTheme()` với accent color forest green.
- `frontend/src/App.tsx` — xóa class `dark` khỏi root div, điều chỉnh padding container.
- `frontend/src/components/Navbar.tsx` — viết lại hoàn toàn: minimalist thin bottom border, wordmark là chữ italic Cormorant Garamond "escrow." không có icon vuông, nav links với underline active state thay vì background pill, Connect button không có border box.
- `frontend/src/components/StatusBadge.tsx` — cập nhật màu sắc sang light-appropriate: border/bg màu pastel (sky-200, amber-200...) thay vì dark opacity variants, badge shape đổi sang pill (rounded-full).
- `frontend/src/pages/LandingPage.tsx` — viết lại hoàn toàn: hero có giant italic serif "trustless." bằng Cormorant Garamond màu forest green (clamp 4rem–8.5rem), stats strip với số lớn italic, how-it-works theo editorial column style, feature grid 2-col, testnet notice với border-l accent.
- `frontend/src/pages/CreateJobPage.tsx` — viết lại hoàn toàn: tiêu đề italic Cormorant Garamond, form dùng underline-only inputs (`.field-input`), label dùng `.field-label` Fira Code, fee breakdown với ETH amount hiển thị bằng italic Cormorant, submit button pill xanh lá.
- `frontend/src/pages/JobDetailPage.tsx` — viết lại hoàn toàn: header với job title italic serif, DataRow dùng thin dividers thay vì card box, amount ETH hiển thị bằng italic green Cormorant, action buttons dùng `.btn-primary/.btn-danger/.btn-secondary` CSS classes thay vì shadcn.
- `frontend/src/pages/DashboardPage.tsx` — viết lại hoàn toàn: stats panel với large italic Cormorant numbers màu xanh lá, job list theo editorial divider style (divide-y) thay vì card rows, ETH amount italic Cormorant bên phải.

**Scope:** `frontend/src/` — toàn bộ CSS, layout shell, navigation, tất cả 4 pages, 2 components UI.

**Effect:** Frontend chuyển sang aesthetic "Verdant Paper" — light, minimalist, editorial. Điểm nhấn không thể quên: chữ "trustless." khổng lồ italic serif màu forest green trên hero; tất cả số ETH hiển thị bằng Cormorant Garamond italic xanh lá; job rows styling như editorial magazine list. Build passes ✅, dev server chạy tại http://localhost:5175.

---

## [2026-03-13] Kiểm duyệt và fix Solidity contracts qua OpenZeppelin MCP server

**Task:** Người dùng yêu cầu dùng MCP server `0penzeppelins` để kiểm tra và sửa lại toàn bộ code Solidity của dự án TrustMarket.

**Changes:**
- `contracts/contracts/TrustToken.sol` — đổi import `Initializable` và `UUPSUpgradeable` từ `contracts-upgradeable/proxy/utils/` sang `contracts/proxy/utils/` (non-upgradeable); xóa `__UUPSUpgradeable_init()` call; cập nhật pragma lên `^0.8.28`
- `contracts/contracts/ItemNFT.sol` — cùng fix import; xóa `__UUPSUpgradeable_init()`; cập nhật pragma
- `contracts/contracts/JuryDAO.sol` — cùng fix import; xóa `__UUPSUpgradeable_init()`; cập nhật pragma
- `contracts/contracts/MarketEscrow.sol` — cùng fix import; xóa `__UUPSUpgradeable_init()`; xóa unused local variable `collateral`; cập nhật pragma
- `contracts/contracts/interfaces/*.sol` + `contracts/contracts/libraries/MarketTypes.sol` — cập nhật pragma lên `^0.8.28`
- `contracts/hardhat.config.ts` — bump Solidity compiler lên `0.8.28`; thêm `evmVersion: "cancun"` để hỗ trợ opcode `mcopy`

**Scope:** Toàn bộ `contracts/contracts/` (4 contracts + 4 interfaces + 1 library) và `contracts/hardhat.config.ts`

**Effect:** Tất cả 46 Solidity files compile sạch với `evm target: cancun`, 0 errors, 0 warnings. Root causes được phát hiện qua MCP server canonical patterns: (1) OZ v5 dùng `Initializable`/`UUPSUpgradeable` từ non-upgradeable package, (2) `__UUPSUpgradeable_init()` không tồn tại trong OZ v5, (3) `mcopy` opcode yêu cầu EVM Cancun.

## [2026-03-18] Map luồng chính của TrustMarket

**Task:** Quét toàn bộ codebase và trích ra luồng chính của dự án, từ lúc app khởi động đến các bước browse, tạo NFT, mua bán phygital, xử lý dispute, và jury vote.

**Changes:**
- `summary.md` — thêm một bản ghi tổng hợp luồng hệ thống để làm mốc tham chiếu cho các lần giải thích hoặc báo cáo sau này.

**Scope:** `frontend/src/`, `contracts/contracts/`, `contracts/scripts/deploy.ts`, `summary.md`

**Effect:** Có sẵn một bản đồ khái quát end-to-end của TrustMarket, giúp đọc nhanh vai trò của từng lớp: bootstrap UI, provider/wallet, data hooks, page actions, escrow lifecycle, jury resolution, và script deploy/wiring.

---

## [2026-03-13] Refactor escrow theo NFT ownership chuyển nhượng

**Task:** Người dùng yêu cầu bắt đầu implementation luồng business mới ở smart contract, trong đó NFT được chuyển owner bình thường nhưng nghĩa vụ listing/escrow/dispute vẫn phải dính với smart contract theo tokenId.

**Changes:**
- `contracts/contracts/libraries/MarketTypes.sol` — thay enum state machine cũ bằng lifecycle mới (`SOLD`, `REDEEMED`, `SHIPPED`, `EXPIRED`...), mở rộng `Listing` với mốc thời gian redeem/shipping/dispute và evidence on-chain (`bytes32 hash + string URI`), mở rộng `Case` với metadata challenger/dispute fee/evidence.
- `contracts/contracts/interfaces/IItemNFT.sol` — đổi surface gọi từ escrow: bỏ `lock/verify`, thêm `marketTransfer` và `ownerOf` để xử lý ownership tại bước mua và kiểm tra holder thực tế.
- `contracts/contracts/interfaces/IJuryDAO.sol` — mở rộng `openCase` nhận thêm `challenger`, `disputeFeeAmount`, `evidenceHash`, `evidenceURI` nhằm đồng bộ dispute model mới.
- `contracts/contracts/ItemNFT.sol` — refactor state NFT sang `LISTED -> SOLD -> BURNED`, thêm `marketTransfer` cho MarketEscrow chuyển NFT sang buyer ngay khi mua, giữ `burnItem` cho redeem/expiry/cancel.
- `contracts/contracts/MarketEscrow.sol` — viết lại flow nghiệp vụ: `listItem` nhận `redeemDuration` per listing, `buyItem` chuyển ownership NFT ngay tại mua, `redeemItem` burn NFT và ghi evidence, `confirmShipped/confirmDelivered` cho luồng giao hàng thật, `raiseDispute` bắt buộc nộp dispute fee upfront, `executeVerdict` xử lý loser-loses-fee và payout mới, `expireRedeem` burn khi quá hạn và giải ngân seller.
- `contracts/contracts/JuryDAO.sol` — cập nhật `openCase` theo signature mới và lưu metadata dispute vào `Case`.
- `contracts/hardhat.config.ts` — bật `viaIR: true` để xử lý lỗi `Stack too deep` phát sinh từ logic refactor lớn.

**Scope:** Toàn bộ Solidity core trong `contracts/contracts/` (MarketEscrow, ItemNFT, JuryDAO, interfaces, shared types) và build config `contracts/hardhat.config.ts`.

**Effect:** Smart contract đã chuyển sang mô hình bearer-rights theo tokenId: NFT có thể đổi owner nhưng quyền/nghĩa vụ escrow không bị tách khỏi listing, redeem window được cấu hình theo từng listing, dispute fee do bên mở tranh chấp nộp trước và thua thì mất. Build contracts compile thành công sau refactor.

---

## [2026-03-13] Khôi phục JuryDAO với commit-reveal và anti-cheat

**Task:** Người dùng yêu cầu tiếp tục tối ưu DAO voting bằng cơ chế commit-reveal, bổ sung onboarding economics cho juror và triển khai các event chi tiết để hệ thống listener theo dõi tranh chấp dễ hơn.

**Changes:**
- `contracts/contracts/libraries/MarketTypes.sol` — mở rộng `Juror` với các trường stake lock, cooldown, lifetime slash và mở rộng `Case` với commit/reveal counters cùng deadline để phục vụ commit-reveal workflow.
- `contracts/contracts/JuryDAO.sol` — thay mới toàn bộ logic JuryDAO: juror register/unregister có lock và cooldown, mở case với payload đầy đủ, commit vote rồi reveal vote kèm lý do (`reasonHash`, `reasonURI`), slash juror không reveal, finalize verdict theo majority hoặc default, và phân phối reward cho juror vote đúng.
- `contracts/contracts/MarketEscrow.sol` — giữ nguyên interface gọi `openCase` đã tương thích với JuryDAO mới; không cần chỉnh sửa thêm logic escrow trong lần này.
- `contracts/contracts/interfaces/IJuryDAO.sol` — giữ nguyên vì đã khớp chữ ký `openCase` mà MarketEscrow sử dụng.
- `contracts/package.json` (chạy lệnh) — compile hợp đồng bằng Hardhat để xác nhận toàn bộ thay đổi build thành công.

**Scope:** `contracts/contracts/libraries/MarketTypes.sol`, `contracts/contracts/JuryDAO.sol` và bước kiểm chứng build trong thư mục `contracts/`.

**Effect:** Hệ thống dispute voting chuyển từ reveal trực tiếp sang commit-reveal để giảm herd behavior, có cơ chế phạt non-reveal để chống bỏ phiếu gian lận/thao túng, và bổ sung event-rich observability cho indexer/listener theo dõi từng pha của dispute lifecycle.

---

## [2026-03-13] Start implementation frontend mới + export ABI đa contract

**Task:** Người dùng yêu cầu bắt đầu triển khai: xuất ABI contracts mới để map dữ liệu frontend, bỏ frontend cũ không liên quan, và dựng lại frontend theo hướng modern SaaS 2026 với React + shadcn + Tailwind cho các module Landing, Marketplace, Dispute, Jury và Profile NFT/redeem.

**Changes:**
- `frontend/src/abi/MarketEscrow.json` — thêm ABI mới từ artifacts làm source-of-truth cho listing lifecycle.
- `frontend/src/abi/JuryDAO.json` — thêm ABI mới từ artifacts cho juror commit-reveal và reward flows.
- `frontend/src/abi/ItemNFT.json` — thêm ABI mới từ artifacts cho NFT ownership và redeem-linked states.
- `frontend/src/abi/TrustToken.json` — thêm ABI mới từ artifacts cho staking token interaction.
- `frontend/src/config/contracts.ts` — tạo lớp cấu hình contract tập trung (addresses + ABIs + status mapping) thay cho single-contract legacy.
- `frontend/src/config/wagmi.ts` — cấu hình wagmi/rainbowkit mới cho app shell 2026.
- `frontend/src/providers/AppProviders.tsx` — thêm provider stack chuẩn production (Wagmi, React Query, RainbowKit, toast).
- `frontend/src/hooks/useMarketData.ts` — thêm hook đọc listing/dispute/profile data trực tiếp từ MarketEscrow ABI.
- `frontend/src/hooks/useJuryActions.ts` — thêm hook thao tác jury (register, commit, reveal, finalize, claim) và helper build commitment.
- `frontend/src/components/SiteLayout.tsx` — thêm app layout mới với navigation theo module.
- `frontend/src/components/MetricCard.tsx` — thêm reusable KPI card cho dashboard-like sections.
- `frontend/src/pages/LandingPage.tsx` — thay mới landing theo visual direction modern SaaS 2026.
- `frontend/src/pages/MarketplacePage.tsx` — thêm trang marketplace map dữ liệu listing onchain.
- `frontend/src/pages/DisputesPage.tsx` — thêm trang dispute center hiển thị case từ trạng thái DISPUTED.
- `frontend/src/pages/JuryPage.tsx` — thêm trang jury portal cho commit-reveal workflow.
- `frontend/src/pages/ProfilePage.tsx` — thêm trang profile NFT-style cho purchased/redeemed portfolio.
- `frontend/src/App.tsx` — rewrite router sang kiến trúc module `/app/*`.
- `frontend/src/main.tsx` — rewrite bootstrap để dùng provider stack mới.
- `frontend/src/index.css` — rewrite toàn bộ design tokens + visual system + utility styles theo aesthetic mới.
- `frontend/.env.example` — đổi schema env sang 4 contract addresses + WalletConnect project id.
- `frontend/.env` — cập nhật key env theo schema mới để chạy local.

**Scope:** `frontend/src/abi/`, `frontend/src/config/`, `frontend/src/providers/`, `frontend/src/hooks/`, `frontend/src/components/`, `frontend/src/pages/`, và entry files frontend (`App.tsx`, `main.tsx`, `index.css`, `.env*`).

**Effect:** Frontend đã chuyển từ single-contract legacy sang kiến trúc đa contract bám ABI mới của MarketEscrow/JuryDAO/ItemNFT/TrustToken, có shell app production-ready với các module chính theo yêu cầu, và build thành công để tiếp tục triển khai phase sâu hơn cho interaction flows.

---

## [2026-03-13] Dọn sạch frontend legacy sau reset

**Task:** Người dùng yêu cầu bỏ hoàn toàn frontend cũ không liên quan, nên cần xóa các file legacy còn sót sau khi dựng shell frontend mới.

**Changes:**
- `deleted: frontend/src/components/Navbar.tsx` — bỏ navbar cũ của flow FreelanceEscrow.
- `deleted: frontend/src/components/StatusBadge.tsx` — bỏ component trạng thái cũ không còn dùng trong kiến trúc mới.
- `deleted: frontend/src/hooks/useContractWrite.ts` — bỏ write hooks cũ theo contract legacy.
- `deleted: frontend/src/hooks/useEscrow.ts` — bỏ read hooks cũ theo shape dữ liệu legacy.
- `deleted: frontend/src/pages/CreateJobPage.tsx` — bỏ trang create job cũ.
- `deleted: frontend/src/pages/DashboardPage.tsx` — bỏ dashboard cũ.
- `deleted: frontend/src/pages/JobDetailPage.tsx` — bỏ detail page cũ.
- `deleted: frontend/src/lib/contract.ts` — bỏ contract mapping một-ABI kiểu cũ.
- `deleted: frontend/src/lib/FreelanceEscrow.json` — bỏ ABI FreelanceEscrow không còn là source-of-truth.
- `deleted: frontend/src/lib/wagmi.ts` — bỏ wagmi config legacy, thay bằng `src/config/wagmi.ts`.

**Scope:** Cleanup trong `frontend/src/components/`, `frontend/src/hooks/`, `frontend/src/pages/`, và `frontend/src/lib/`.

**Effect:** Codebase frontend sạch khỏi lớp legacy, giảm rủi ro import nhầm logic cũ và đảm bảo kiến trúc mới chỉ bám ABI/contracts hiện tại.

---

## [2026-03-13] Bổ sung write flows onchain cho Marketplace, Disputes và Profile

**Task:** Người dùng đã yêu cầu bắt đầu implementation frontend mới theo ABI contracts, nên cần đi tiếp từ shell hiện có để kích hoạt các thao tác ghi onchain thực tế thay vì chỉ hiển thị dữ liệu read-only.

**Changes:**
- `frontend/src/hooks/useMarketActions.ts` — thêm hook write tập trung cho `listItem`, `buyItem`, `raiseDispute`, `redeemItem`, `confirmShipped`, `confirmDelivered`; tự gọi `calcCollateral` và `calcDisputeFee` từ contract để gửi đúng `value`.
- `frontend/src/pages/MarketplacePage.tsx` — thêm form tạo listing onchain và nút `Buy now` theo điều kiện trạng thái/role để người dùng có thể thực hiện giao dịch mua trực tiếp từ listing card.
- `frontend/src/pages/DisputesPage.tsx` — thêm panel mở dispute onchain với listing ID và evidence payload, đồng thời bổ sung action nhanh từ dispute card.
- `frontend/src/pages/ProfilePage.tsx` — thêm action theo lifecycle sau mua: `Redeem item`, `Confirm shipped`, `Confirm delivered`, kèm preset evidence hash/URI dùng lại giữa các giao dịch.

**Scope:** `frontend/src/hooks/` và `frontend/src/pages/` (TypeScript React + wagmi/viem write integration).

**Effect:** Frontend chuyển từ trạng thái module chủ yếu đọc dữ liệu sang có thể thao tác nghiệp vụ chính trực tiếp với MarketEscrow theo ABI mới, giúp hoàn thiện luồng end-to-end cho buyer/seller/redeemer trong môi trường onchain thật.

---

## [2026-03-14] Xuất lại tài liệu business logic

**Task:** Người dùng yêu cầu xuất lại file .md mô tả business logic của hệ thống để xem nhanh toàn bộ flow nghiệp vụ hiện tại.

**Changes:**
- `BUSINESS_LOGIC.md` — tạo mới tài liệu mô tả state machine, luồng listing/redeem/dispute, công thức tài chính và quy tắc commit-reveal của JuryDAO để đối chiếu trực tiếp với implementation Solidity.
- `summary.md` — bổ sung bản ghi thay đổi nhằm lưu vết tác vụ theo quy tắc summary tracking của project.

**Scope:** Tài liệu Markdown ở workspace root, tập trung vào business logic của các contract `MarketEscrow`, `ItemNFT`, `JuryDAO`, và `MarketTypes`.

**Effect:** Dự án có lại tài liệu business logic độc lập ở dạng .md, giúp review nghiệp vụ nhanh, onboarding dễ hơn và giảm sai lệch giữa hiểu biết sản phẩm với logic onchain.

---

## [2026-03-15] Hoàn thiện UI toàn bộ frontend — Phases 10C, 10D review, 10F + sửa lỗi build

**Task:** Tiếp tục thực thi kế hoạch 10-phase production hardening: dọn dẹp ProfilePage bị trùng code, sửa lỗi TypeScript trong ListingDetailPage, và hoàn thiện DiscoverPage với dữ liệu thực từ blockchain.

**Changes:**
- `frontend/src/pages/ProfilePage.tsx` — Xóa hoàn toàn phần thân hàm cũ bị thừa (orphaned code) sau `EmptySection` bằng cách dùng PowerShell truncate file về đúng 191 dòng; xóa import thừa `formatEther` và `useTokenMetadata` không dùng đến để loại bỏ cảnh báo TypeScript.
- `frontend/src/pages/ListingDetailPage.tsx` — Sửa 3 lỗi TypeScript: (1) xóa khai báo hàm `addr()` trùng lặp ở đầu file vì đã có bản đúng ở cuối file; (2) ép kiểu `isBuyer` về `boolean` bằng `Boolean(...)` để khớp kiểu `boolean` thay vì `string | boolean`; (3) ép kiểu mảng `[STATUS.REDEEMED, STATUS.SHIPPED]` về `number[]` để tương thích với `.includes(listing.status)` khi `listing.status` là `number`.
- `frontend/src/pages/DiscoverPage.tsx` — Viết lại hoàn toàn, kết nối dữ liệu thực từ `useListings()`: giữ nguyên hero banner thiết kế gốc nhưng thay số liệu tĩnh bằng số liệu thực (floor price, total items, volume, active count); panel bên phải hiển thị 5 listing gần nhất sắp xếp theo ID giảm dần; thêm grid "New Arrivals" hiển thị tối đa 8 listing ACTIVE với component `DiscoverListingCard` tự đọc `tokenURI` từ `ItemNFT`; thêm thanh stats phía dưới (Total Listed, For Sale, In Escrow, Completed). Xóa toàn bộ dữ liệu hardcode (Quirkies, CryptoPunks, mock tokens).

**Scope:** `frontend/src/pages/` (3 files), build output in `frontend/dist/`

**Effect:** Frontend build thành công không có lỗi TypeScript. Tất cả trang đều hiển thị dữ liệu thực từ blockchain thay vì mock data. ProfilePage sạch không còn code thừa gây lỗi biên dịch. ListingDetailPage hoạt động đúng với các type guard an toàn. DiscoverPage trở thành landing page thực sự kết nối on-chain.

## [2025-07-22] Fix wallet persistence on F5 reload (wagmi ssr: true)

**Task:** Diagnose and fix the bug where pressing F5 in the browser caused the wallet connection to be lost, requiring the user to reconnect MetaMask every time they reloaded the page.

**Changes:**
- `frontend/src/config/wagmi.ts` � changed `ssr: false` to `ssr: true` and removed the spurious `reconnectOnMount: true` option (which was silently ignored by `createConfig`). Despite the naming, `ssr: true` does not require a server-rendered app; it controls *when* wagmi calls its internal `onMount()` function.

**Scope:** frontend wagmi configuration (`frontend/src/config/wagmi.ts`)

**Effect:** With `ssr: false`, wagmi calls `onMount()` synchronously *during the React render phase*, creating two race conditions: (1) Zustand's persist middleware uses an async storage wrapper so localStorage state is not yet rehydrated when `reconnect` runs, and (2) MetaMask's EIP-6963 provider announcement has not yet fired, so `getProvider()` returns undefined and the injected connector is skipped. Setting `ssr: true` moves `onMount()` into a React `useEffect`, ensuring it runs after the first paint. Crucially, the `@wagmi/core` `hydrate` function explicitly calls `await config._internal.store.persist.rehydrate()` before invoking `reconnect` when `ssr: true`, so both race conditions are eliminated and the wallet reconnects automatically on every page reload.

## [2026-03-14] Fix wallet persistence on F5 � delayed reconnect fallback

**Task:** Wallet connection was still lost on page reload despite previous `ssr: true` fix. Root cause: MetaMask SDK connector's `sdk.init()` is async and may not complete before wagmi's built-in reconnect iterator calls `isAuthorized()` (200 ms timeout x 3 retries = ~800 ms window), causing reconnect to fail silently and set status to `'disconnected'` with no further retry.

**Changes:**
- `frontend/src/providers/AppProviders.tsx` � added `WalletAutoReconnect` component. Uses wagmi's `useReconnect` + `useAccount` hooks with a `useRef` guard: if the wallet is disconnected on mount (i.e. the built-in reconnect failed), fires one additional `reconnect()` call after a 1-second delay, giving MetaMask SDK time to initialize. The guard ensures it only retries once, so explicit user disconnects are not overridden.
- `frontend/src/config/wagmi.ts` � reverted `ssr` back to `false`. With `ssr: true` the entire initial render shows disconnected state (Zustand skips auto-hydration). `ssr: false` gives an immediate synchronous reconnect attempt from wagmi, and the new `WalletAutoReconnect` provides the delayed fallback.

**Scope:** `frontend/src/providers/AppProviders.tsx`, `frontend/src/config/wagmi.ts`

**Effect:** On page reload, wagmi first attempts its built-in reconnect synchronously. If that fails (MetaMask SDK not ready), `WalletAutoReconnect` fires a second attempt 1 s later when the SDK is initialized. The wallet stays connected across F5 reloads without requiring the user to manually reconnect.

## [2026-03-14] Fix buy button not working on ListingDetailPage

**Task:** User reported pressing the Buy button did nothing. Root cause: two separate issues � (1) when the user is the seller of their own listing, the buy button is hidden with no explanation, and (2) when the wallet is not connected (e.g., after F5 reload with reconnect still buggy), the buy button appears (isSeller = false since address = undefined) but clicking it triggers writeContractAsync with no signer, causing a confusing error.

**Changes:**
- `frontend/src/pages/ListingDetailPage.tsx` � split the single BUY button condition into three explicit branches: (a) if seller ? show "You are the seller � switch to a different wallet account to buy" hint text; (b) if not connected ? show "Connect Wallet to Buy" button that triggers RainbowKit's openConnectModal; (c) if connected and not seller ? show the normal Buy button. Added `useConnectModal` from `@rainbow-me/rainbowkit` to enable (b).

**Scope:** `frontend/src/pages/ListingDetailPage.tsx`

**Effect:** Buyers who are not connected get a clear Connect Wallet prompt instead of a silent error. Sellers see an explanatory message instead of a missing button they don't understand. The actual buy transaction path (connected, not seller) is unchanged.

## [2026-03-14] Fix all action buttons permanently stuck disabled on ListingDetailPage

**Task:** All action buttons (Buy, Redeem, Shipped, Delivered, Dispute, Cancel) were permanently unclickable and remained disabled even after switching wallets.

**Changes:**
- `frontend/src/pages/ListingDetailPage.tsx` � replaced `disabled={actions.isPending}` (wagmi's internal mutation state) with a local `isRunning` state on all action buttons. The `run()` helper now sets `isRunning = true` before calling the contract function and resets it in a `finally` block after any outcome (success or error). A guard `if (isRunning) return;` prevents double-submits.

**Scope:** `frontend/src/pages/ListingDetailPage.tsx`

**Effect:** The root cause was that `actions.isPending` (from wagmi's `useWriteContract`) could get permanently stuck at `true` if the user opened a MetaMask popup then switched accounts inside MetaMask without confirming or rejecting, leaving the underlying promise unresolved. Because shadcn/ui `Button` applies `disabled:pointer-events-none` when disabled, the button became completely unclickable with no way to recover short of page reload. The local `isRunning` state with `finally` guarantees buttons always re-enable after any outcome.

## [2026-03-14] Fix action buttons not responding � isConnected vs address

**Task:** Buy and Cancel Listing buttons were not working even after switching wallets. Clicking did nothing visually.

**Changes:**
- `frontend/src/pages/ListingDetailPage.tsx` � 4 fixes:
  1. `useAccount()` now also destructures `isConnected`. All action button conditions switched from `!!address` (truthy check) to `isConnected` (wagmi's authoritative boolean). During wagmi's `'reconnecting'` state, `address` is populated from localStorage but `isConnected = false`, causing `writeContractAsync` to silently fail or hang since the MetaMask signer is not yet ready.
  2. `myAddr / isSeller / isBuyer` � only computed as matching when `isConnected && address` are both true. Previously, during reconnecting, `isSeller` could be `true` (address matched) but the transaction was impossible.
  3. `run()` helper � added `if (!isConnected) { openConnectModal?.(); return; }` guard before the transaction attempt, so users get the connect modal instead of a silent hang. Also improved error extraction from viem's verbose `ContractFunctionExecutionError` (extracts `reason:` or `Error:` substring). Added `console.error` for full error in DevTools.
  4. `getListing` query � removed `&& listingId > 0n` guard that prevented listing #0 (the very first listing ever created) from loading.

**Scope:** `frontend/src/pages/ListingDetailPage.tsx`

**Effect:** Buttons now correctly show ''Connect Wallet'' when disconnected, and correctly disable themselves when wagmi is still reconnecting. Transactions only fire when the wallet is truly connected and the signer is ready. Error messages are extracted from viem's verbose format into short readable reason strings.

## [2026-03-14] Replace @base-ui/react Button with native HTML button

**Task:** All buttons on ListingDetailPage (Buy, Cancel Listing, Redeem, etc.) were completely unclickable � no hover effect, no cursor change, no response to clicks at all.

**Changes:**
- `frontend/src/components/ui/button.tsx` � completely replaced the `@base-ui/react/button` (`ButtonPrimitive`) wrapper with a standard native `<button>` element using `React.forwardRef`. Kept the same CVA (class-variance-authority) styling system with identical variant and size options. Added explicit `cursor-pointer` class (Tailwind v4 removed auto cursor on buttons). Fixed the default variant hover class from `[a]:hover:bg-primary/80` (invalid nested selector that only worked inside anchors) to `hover:bg-primary/80`. Type defaults to `"button"` to prevent accidental form submission.

**Scope:** `frontend/src/components/ui/button.tsx` (affects every Button usage site-wide)

**Effect:** The `@base-ui/react` v1.2.0 Button component intercepts `onClick`, `onPointerDown`, `onMouseDown`, and `onKeyDown` through its `useButton` hook via `mergeProps`. Its internal `getButtonProps` creates wrapped handler chains that can silently swallow events depending on internal state (disabled detection, composite item context, native vs non-native button mode). Replacing it with a plain `<button>` element eliminates all of these interception layers, making buttons immediately clickable with standard browser behavior. All existing `disabled`, `onClick`, `className`, and `variant/size` props continue to work identically.

## [2026-03-14] Move Phygital lifecycle tabs into right column of TokenDetailPage

**Task:** Người dùng yêu cầu di chuyển phần Order Timeline + Actions (tabs phygital) từ vị trí full-width bên dưới toàn trang lên bên trong cột phải, ngay dưới mục Redeem Window và trước mục Traits.

**Changes:**
- `frontend/src/pages/TokenDetailPage.tsx` — Xóa block `{/* ─── Phygital lifecycle section */}` (vốn nằm ngoài grid 2 cột ở dưới cùng trang) và đặt lại block này bên trong div cột phải (`className="space-y-6"`), giữa Phygital Redeem Window và Traits. Toàn bộ nội dung (Order Timeline tab, Actions tab với tất cả các trạng thái: ACTIVE/SOLD/REDEEMED/SHIPPED/DISPUTED/Terminal) được tái cấu trúc sang indent 14-space cho phù hợp với cột phải. TypeScript kiểm tra sạch sau thay đổi.

**Scope:** `frontend/src/pages/TokenDetailPage.tsx`

**Effect:** Trên trang chi tiết token phygital, phần Order Timeline và Actions bây giờ xuất hiện trong cột phải của layout 2 cột, ngay bên dưới Redeem Window thay vì chiếm toàn bộ chiều rộng ở dưới cùng trang. Layout trở nên gọn gàng hơn, người dùng thấy ngay các hành động liên quan cạnh thông tin token mà không cần scroll xuống tận cùng.

## [2025-07-16] TrustMarket V2 — Full Solidity Rewrite

**Task:** Rewrite toàn bộ smart contracts: thay ERC721 ItemNFT bằng ERC1155 shared collections (Sets), thêm dual token types (Normal collectible + Phygital physical goods), on-chain traits (max 20), absolute redeem windows, encrypted shipping info hash, passive settlement (timeout-based), và clean JuryDAO rewrite. Fix V1 `accumulatedDisputeFees` accounting bug.

**Changes:**
- `contracts/contracts/libraries/MarketTypes.sol` — rewrote toàn bộ enums và structs. Thêm `TokenType` (NORMAL/PHYGITAL), `TokenState` (ACTIVE/LISTED/LOCKED/BURNED), struct `Trait` (key:value), `Set` (collection metadata), `TokenInfo` (per-token info với redeemStart/redeemEnd). Rewrite struct `Listing` — bỏ evidence fields cũ, thêm `shippingInfoHash`, `shippingDeadline`, `disputeDeadline`. Giữ nguyên `Juror` và `Case` structs.
- `contracts/contracts/MarketCollection.sol` — **created** shared ERC1155 contract thay thế ItemNFT. ERC1155SupplyUpgradeable + AccessControlUpgradeable + PausableUpgradeable + UUPSUpgradeable. Set management (createSet, updateSetMetadata). Dual mint: `mintNormal` (auto-list nếu price>0) và `mintPhygital` (forward collateral đến PhygitalEscrow). Normal marketplace built-in (listNormalToken, buyNormalToken, cancelNormalListing). ESCROW_ROLE cho PhygitalEscrow (lockToken, burnToken, unlockToken, escrowTransfer). Transfer restrictions qua `_update` override: LOCKED = blocked, LISTED = chỉ ESCROW_ROLE/contract, ACTIVE = free. Per-token URI, owner tracking qua `_tokenOwner` mapping.
- `contracts/contracts/PhygitalEscrow.sol` — **created** thay thế MarketEscrow. Escrow lifecycle cho Phygital tokens: createListing (từ MarketCollection) → buyItem → redeemItem (lock NFT + shipping info hash) → confirmShipped → passive settlement (settle sau disputeDeadline) hoặc raiseDispute. Thêm `expireShipping` (seller không ship trong 14 ngày → buyer refund + seller mất collateral). Fix V1 bug: bỏ `accumulatedDisputeFees`, dispute fee ETH ở JuryDAO, không track phantom balance.
- `contracts/contracts/JuryDAO.sol` — rewrote references từ `IMarketEscrow` sang `IPhygitalEscrow`. Đổi `marketEscrow` → `phygitalEscrow`, modifier `onlyMarketEscrowContract` → `onlyPhygitalEscrowContract`, event `MarketEscrowSet` → `PhygitalEscrowSet`. Logic commit-reveal giữ nguyên.
- `contracts/contracts/interfaces/IMarketCollection.sol` — **created** interface cho MarketCollection (lockToken, burnToken, unlockToken, escrowTransfer, ownerOf, getTokenInfo).
- `contracts/contracts/interfaces/IPhygitalEscrow.sol` — **created** interface cho PhygitalEscrow (createListing, executeVerdict, calcCollateral).
- `contracts/contracts/interfaces/IJuryDAO.sol` — updated comment từ MarketEscrow sang PhygitalEscrow.
- `deleted: contracts/contracts/ItemNFT.sol` — replaced by MarketCollection.sol
- `deleted: contracts/contracts/MarketEscrow.sol` — replaced by PhygitalEscrow.sol
- `deleted: contracts/contracts/interfaces/IItemNFT.sol` — replaced by IMarketCollection.sol
- `deleted: contracts/contracts/interfaces/IMarketEscrow.sol` — replaced by IPhygitalEscrow.sol
- `contracts/scripts/deploy.ts` — rewrote deployment: TrustToken → MarketCollection → JuryDAO → PhygitalEscrow → grant ESCROW_ROLE → wire setPhygitalEscrow (JuryDAO + MarketCollection) → update frontend/.env với new var names (VITE_MARKET_COLLECTION_ADDRESS, VITE_PHYGITAL_ESCROW_ADDRESS). Cleanup old V1 env vars.

**Scope:** contracts/contracts/, contracts/scripts/, contracts/contracts/interfaces/, contracts/contracts/libraries/

**Effect:** TrustMarket V2 architecture — shared ERC1155 collections thay thế per-listing ERC721. Normal tokens có marketplace built-in, Phygital tokens có escrow lifecycle với passive settlement, absolute redeem windows, và on-chain traits. V1 `accumulatedDisputeFees` phantom accounting bug đã được fix. Compiled 43 Solidity files successfully with zero errors.

---

## [2025-07-20] Frontend V2 — Phase 3.2 completion: page updates, ABI encoding fix, build verified

**Task:** Tiếp tục triển khai frontend V2 redesign: recreate DisputesPage (đã bị xóa ở session trước nhưng chưa tạo lại), cập nhật JuryPage và LandingPage cho V2, sửa lỗi build ABI encoding, và xác nhận build thành công.

**Changes:**
- `frontend/src/pages/DisputesPage.tsx` — tạo lại hoàn toàn cho V2. Import từ `usePhygitalListings` và `useProfilePhygitalListings` (thay thế `useListings`/`useProfileListings` đã bị xóa). Hiển thị metrics (Active Disputes, Dispute Fees Locked, Your Disputable). Form raise dispute cho SHIPPED items (buyer-only, cần evidenceHash + evidenceURI). Grid hiển thị các disputed listings với challenger, locked fee, evidence link.
- `frontend/src/pages/JuryPage.tsx` — thay `import { useListings } from "@/hooks/useMarketData"` bằng `import { usePhygitalListings } from "@/hooks/usePhygitalData"`. Đổi `useListings()` thành `usePhygitalListings()`. Xóa `as any` cast trên ABI (vi phạm instruction no-any).
- `frontend/src/pages/LandingPage.tsx` — cập nhật V2 terminology: route `/app/discover` → `/app/explore`, contract names `ItemNFT` → `MarketCollection` và `MarketEscrow` → `PhygitalEscrow`, `ERC-721` → `ERC-1155`, `8 Statuses` → `9 Statuses`, metrics note `Market · Jury · NFT · Token` → `Collection · Escrow · Jury · Trust`.
- `frontend/src/abi/MarketCollection.json` — fixed UTF-16LE BOM encoding → UTF-8 no BOM (Vite JSON plugin không parse được UTF-16LE).
- `frontend/src/abi/PhygitalEscrow.json` — fixed UTF-16LE BOM encoding → UTF-8 no BOM.
- `frontend/src/abi/JuryDAO.json` — fixed UTF-16LE BOM encoding → UTF-8 no BOM.
- `frontend/src/abi/TrustToken.json` — fixed UTF-16LE BOM encoding → UTF-8 no BOM.

**Scope:** frontend/src/pages/, frontend/src/abi/

**Effect:** Phase 3.2 hoàn tất — tất cả pages đều đã được cập nhật cho V2 contracts (MarketCollection, PhygitalEscrow, JuryDAO, TrustToken). Không còn import nào từ hooks cũ đã xóa (useMarketData, useMarketActions). ABI files đã được fix encoding và Vite production build thành công (2309 modules, 0 errors). TypeScript `tsc --noEmit` cũng pass clean.

---

## [2026-03-15] Deploy V2 contracts lên Hardhat localhost và khởi chạy frontend

**Task:** Người dùng yêu cầu chạy và deploy thử toàn bộ hệ thống TrustMarket V2 trên local environment.

**Changes:**
- Khởi động Hardhat node local (`npx hardhat node`) trên `http://127.0.0.1:8545` (chainId 31337).
- Deploy 4 UUPS proxies thành công qua `scripts/deploy.ts --network localhost`:
  - TrustToken: `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`
  - MarketCollection: `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9`
  - JuryDAO: `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707`
  - PhygitalEscrow: `0xa513E6E4b8f2a923D98304ec87F64353C4D5C853`
- Wiring hoàn tất: ESCROW_ROLE granted, `setPhygitalEscrow` called on cả JuryDAO và MarketCollection.
- `frontend/.env` — deploy script tự động cập nhật 4 contract addresses (thay thế zero addresses cũ).
- Frontend dev server khởi động thành công (`npx vite --host`) tại `http://localhost:5173/`.

**Scope:** contracts/ (deploy), frontend/.env (addresses), frontend/ (dev server)

**Effect:** Toàn bộ TrustMarket V2 stack đang chạy trên local: Hardhat node + 4 deployed contracts (wired) + Vite frontend. Sẵn sàng để test các luồng: create set, mint token, list/buy normal, phygital escrow lifecycle, jury dispute.

---

## [2026-03-15] Fix dispute flow: seed JuryDAO pool + c?i thi?n error messages

**Task:** Raise Dispute b? k?t v?i "Missing gas limit" v� JuryDAO.openCase revert do kh�ng c� juror n�o dang k�. C?ng th�m display bug c?a MetaMask (hi?n th? raw wei nhu ETH tr�n Hardhat network).

**Changes:**
- `contracts/scripts/seed-jurors.ts` � t?o m?i: script seed 3 juror accounts (Hardhat accounts 2,3,4). Mint 100 TRUST m?i account ? approve JuryDAO ? registerJuror(). �?c d?a ch? t? frontend/.env n�n d�ng du?c map. Run: `npx hardhat run scripts/seed-jurors.ts --network localhost`.
- `contracts/scripts/deploy.ts` � th�m bu?c [9]: t? d?ng seed 3 juror sau khi deploy, d?m b?o m?i deploy m?i d?u c� jury pool s?n s�ng. Import th�m `parseEther` t? ethers. 
- `frontend/src/pages/PhygitalDetailPage.tsx` � c?i thi?n error handler trong `run()`: parse c�c known contract revert reasons (NotEnoughJurors, IncorrectPayment, NotParticipant, DisputeDeadlineExpired) th�nh th�ng b�o ti?ng Anh r� r�ng thay v� hi?n raw error message.

**Scope:** contracts/scripts/, frontend/src/pages/PhygitalDetailPage.tsx

**Effect:** Dispute flow ho?t d?ng du?c ngay sau deploy. `JuryDAO.openCase` kh�ng c�n revert v?i `NotEnoughJurors(0, 3)`. Frontend hi?n th? l?i th�n thi?n thay v� "Contract reverted" v� nghia.
