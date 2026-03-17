// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/**
 * $TRUST — governance token của TrustMarket.
 * Jurors stake $TRUST để được tham gia xét xử tranh chấp.
 * Chỉ owner (platform) có thể mint, capped tại 100M TRUST.
 */
contract TrustToken is Initializable, ERC20Upgradeable, OwnableUpgradeable, UUPSUpgradeable {

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant MAX_SUPPLY = 100_000_000 ether; // 100M TRUST

    // ─── Errors ───────────────────────────────────────────────────────────────

    error ExceedsMaxSupply(uint256 requested, uint256 remaining);

    // ─── Constructor ──────────────────────────────────────────────────────────

    // Ngăn implementation contract bị khởi tạo trực tiếp (UUPS requirement).
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ─── Initializer ──────────────────────────────────────────────────────────

    // Thay thế constructor, chỉ gọi được qua proxy một lần duy nhất.
    function initialize(address initialOwner) external initializer {
        __ERC20_init("Trust Token", "TRUST");
        __Ownable_init(initialOwner);
    }

    // ─── Owner actions ────────────────────────────────────────────────────────

    // Mint $TRUST cho địa chỉ bất kỳ, không vượt MAX_SUPPLY.
    function mint(address to, uint256 amount) external onlyOwner {
        uint256 remaining = MAX_SUPPLY - totalSupply();
        if (amount > remaining) revert ExceedsMaxSupply(amount, remaining);
        _mint(to, amount);
    }

    // ─── UUPS ─────────────────────────────────────────────────────────────────

    // Chỉ owner mới được phép upgrade implementation.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ─── Storage gap ──────────────────────────────────────────────────────────

    // Dự phòng 50 slot cho các biến có thể thêm khi upgrade (TrustToken không có own storage).
    uint256[50] private __gap;
}
