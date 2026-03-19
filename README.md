# TrustMarket V2

Marketplace NFT phygital có cơ chế escrow và phân xử tranh chấp phi tập trung.

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
