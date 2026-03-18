import MarketCollectionABI from "@/abi/MarketCollection.json";
import PhygitalEscrowABI from "@/abi/PhygitalEscrow.json";
import JuryDAOABI from "@/abi/JuryDAO.json";
import TrustTokenABI from "@/abi/TrustToken.json";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

export const contracts = {
  marketCollection: {
    address: (import.meta.env.VITE_MARKET_COLLECTION_ADDRESS || ZERO_ADDR) as `0x${string}`,
    abi: MarketCollectionABI,
  },
  phygitalEscrow: {
    address: (import.meta.env.VITE_PHYGITAL_ESCROW_ADDRESS || ZERO_ADDR) as `0x${string}`,
    abi: PhygitalEscrowABI,
  },
  juryDao: {
    address: (import.meta.env.VITE_JURY_DAO_ADDRESS || ZERO_ADDR) as `0x${string}`,
    abi: JuryDAOABI,
  },
  trustToken: {
    address: (import.meta.env.VITE_TRUST_TOKEN_ADDRESS || ZERO_ADDR) as `0x${string}`,
    abi: TrustTokenABI,
  },
} as const;

export function isContractReady(address?: string) {
  if (!address) return false;
  return address !== ZERO_ADDR && address.length === 42;
}

// Matches ListingStatus enum in MarketTypes.sol
export const STATUS = {
  ACTIVE:    0,
  SOLD:      1,
  REDEEMED:  2,
  SHIPPED:   3,
  COMPLETED: 4,
  DISPUTED:  5,
  REFUNDED:  6,
  EXPIRED:   7,
  CANCELLED: 8,
} as const;

export type StatusValue = (typeof STATUS)[keyof typeof STATUS];

// Matches TokenType enum in MarketTypes.sol
export const TOKEN_TYPE = {
  NORMAL:   0,
  PHYGITAL: 1,
} as const;

export type TokenTypeValue = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

// Matches TokenState enum in MarketTypes.sol
export const TOKEN_STATE = {
  ACTIVE: 0,
  LISTED: 1,
  LOCKED: 2,
  BURNED: 3,
} as const;

export type TokenStateValue = (typeof TOKEN_STATE)[keyof typeof TOKEN_STATE];

export const listingStatusLabel: Record<number, string> = {
  0: "Active",
  1: "Sold",
  2: "Redeemed",
  3: "Shipped",
  4: "Completed",
  5: "Disputed",
  6: "Refunded",
  7: "Expired",
  8: "Cancelled",
};

export const listingStatusStyle: Record<number, { bg: string; text: string; dot?: string }> = {
  0: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  1: { bg: "bg-blue-500/10",    text: "text-blue-400" },
  2: { bg: "bg-indigo-500/10",  text: "text-indigo-400" },
  3: { bg: "bg-amber-500/10",   text: "text-amber-400", dot: "bg-amber-400" },
  4: { bg: "bg-emerald-500/10", text: "text-emerald-300" },
  5: { bg: "bg-rose-500/10",    text: "text-rose-400",  dot: "bg-rose-400 animate-pulse" },
  6: { bg: "bg-purple-500/10",  text: "text-purple-400" },
  7: { bg: "bg-zinc-500/10",    text: "text-zinc-400" },
  8: { bg: "bg-zinc-800",       text: "text-zinc-500" },
};

export const tokenTypeLabel: Record<number, string> = {
  0: "Normal",
  1: "Phygital",
};

export const tokenStateLabel: Record<number, string> = {
  0: "Active",
  1: "Listed",
  2: "Locked",
  3: "Burned",
};

export const tokenStateStyle: Record<number, { bg: string; text: string }> = {
  0: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  1: { bg: "bg-blue-500/10",    text: "text-blue-400" },
  2: { bg: "bg-amber-500/10",   text: "text-amber-400" },
  3: { bg: "bg-zinc-800",       text: "text-zinc-500" },
};
