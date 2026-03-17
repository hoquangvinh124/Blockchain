import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { hardhat, sepolia } from "wagmi/chains";
import { createStorage } from "wagmi";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID";

// Override hardhat chain so MetaMask displays ETH amounts correctly
const localHardhat = {
  ...hardhat,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
} as const;

export const config = getDefaultConfig({
  appName: "TrustMarket 2026",
  projectId,
  chains: [localHardhat, sepolia],
  ssr: false,
  storage: createStorage({ storage: window.localStorage }),
});
