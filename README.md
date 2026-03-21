# TrustMarket V2

Marketplace NFT phygital có cơ chế escrow và phân xử tranh chấp phi tập trung.

---

## 📌 Giới thiệu Dự án

**TrustMarket** là một nền tảng giao dịch NFT phygital (kết hợp tài sản kỹ thuật số và vật lý) được xây dựng trên blockchain, giải quyết bài toán **tin tưởng không cần trung gian**. 

### 🎯 Vấn đề giải quyết
- **Giao dịch NFT phygital**: Khi mua NFT kèm tài sản vật lý thực, người mua không chắc sẽ nhận được hàng
- **Tranh chấp**: Không có cơ chế xử lý khi xảy ra tranh chấp giữa bên mua - bên bán
- **Thiếu minh bạch**: Quá trình giao dịch không rõ ràng, dễ bị lừa đảo

### ✨ Tính năng chính

1. **Escrow thông minh** (PhygitalEscrow)
   - Tiền được giữ trong smart contract cho đến khi cả 2 bên xác nhận giao dịch
   - Nếu có tranh chấp, tiền bị tạm khóa tự động

2. **Hệ thống JuryDAO**
   - Những người được cấu hình sẵn (Jurors) bỏ phiếu giải quyết tranh chấp
   - Quyết định công bằng dựa trên bằng chứng từ cả 2 bên
   - Bên thua cuộc mất phí tranh chấp, bên thắng nhận lại tiền + phí

3. **Token TrustToken (ERC-20)**
   - Token native dùng để thanh toán, stake, hoặc chi trả phí hệ thống

4. **Quản lý Collection**
   - Tạo và quản lý các collection NFT phygital
   - Mỗi item là một NFT độc nhất với metadata hoàn chỉnh

5. **Interface thân thiện**
   - Frontend React với Vite cho trải nghiệm nhanh
   - Kết nối MetaMask để quản lý ví
   - Hiển thị trạng thái giao dịch real-time (chờ xác nhận, tranh chấp, hoàn tất)

### 🏗️ Kiến trúc
- **Smart Contracts**: Hardhat + Solidity (ERC-20, ERC-721)
- **Frontend**: React + TypeScript + Vite + Wagmi (Web3)
- **Backend**: IPFS (Pinata) để lưu trữ metadata và bằng chứng
- **Deployment**: Docker Compose để chạy Hardhat local node + frontend

---

## Yêu cầu

| Công cụ | Phiên bản tối thiểu |
|---------|-------------------|
| Node.js | 18+ |
| pnpm | 8+ (`npm i -g pnpm`) |
| Docker + Docker Compose | bất kỳ |
| MetaMask | extension trên Chrome/Firefox |

---

## Cách 1 — Chạy thủ công (development)

Mở **3 terminal** theo thứ tự:

### Terminal 1 — Hardhat local node

```bash
cd contracts
pnpm install
pnpm node
```

Để nguyên terminal này chạy. Node sẽ in ra 20 account test với private key sẵn.

---

### Terminal 2 — Deploy smart contracts

Sau khi terminal 1 đang chạy:

```bash
cd contracts
pnpm deploy:local
```

Script tự động:
- Deploy 4 contract (TrustToken, MarketCollection, JuryDAO, PhygitalEscrow)
- Seed 3 juror account (account #3, #4, #5)
- Ghi địa chỉ contract vào `frontend/.env`

---

### Terminal 3 — Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Mở trình duyệt tại: **http://localhost:5173**

---

## Cách 2 — Docker (một lệnh duy nhất)

```bash
docker compose up --build
```

Mở trình duyệt tại: **http://localhost**

> Frontend sẽ tự chờ deploy xong rồi mới khởi động.

---

## Cấu hình MetaMask

1. Mở MetaMask → **Add a network manually**
2. Điền:
   - **Network name:** Hardhat Local
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
   - **Currency symbol:** `ETH`
3. Import account test — copy private key từ output của terminal 1, ví dụ account #0:
   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```

> Mỗi lần restart hardhat node cần **reset account** trong MetaMask: Settings → Advanced → Clear activity tab data.

---

## Cấu hình IPFS (Pinata) — tuỳ chọn

Để upload ảnh và bằng chứng lên IPFS, tạo file `frontend/.env` và thêm:

```env
VITE_PINATA_JWT=<JWT token từ app.pinata.cloud>
VITE_PINATA_GATEWAY=<subdomain>.mypinata.cloud
```

Nếu bỏ qua, tính năng upload file sẽ không hoạt động nhưng phần còn lại vẫn chạy bình thường.

---

## Cấu trúc project

```
contracts/   — Solidity contracts + Hardhat
frontend/    — React + Vite + wagmi
```

---

## Tài khoản test mặc định

| Account | Vai trò mặc định |
|---------|-----------------|
| #0 | Deployer / Admin |
| #1 | Seller |
| #2 | Buyer |
| #3 #4 #5 | Juror (đã stake TRUST) |
