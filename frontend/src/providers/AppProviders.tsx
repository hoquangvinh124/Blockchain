import React, { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useAccount, useReconnect } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { config } from "@/config/wagmi";

const queryClient = new QueryClient();

/**
 * Retries wagmi reconnect once after mount.
 * MetaMask SDK may not finish initializing before wagmi's built-in reconnect
 * runs, causing it to fail silently. This fires a second attempt 1 s later.
 */
function WalletAutoReconnect() {
  const { reconnect } = useReconnect();
  const { isDisconnected } = useAccount();
  const tried = useRef(false);

  useEffect(() => {
    if (!isDisconnected || tried.current) return;
    tried.current = true;
    const id = setTimeout(() => reconnect(), 1000);
    return () => clearTimeout(id);
  }, [isDisconnected, reconnect]);

  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          theme={darkTheme({
            accentColor: "var(--color-accent)",
            accentColorForeground: "white",
            borderRadius: "medium",
            fontStack: "system",
            overlayBlur: "small",
          })}
        >
          <WalletAutoReconnect />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
