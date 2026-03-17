import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Search } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Outlet } from "react-router-dom";

export function SiteLayout() {
  return (
    <div className="relative flex min-h-screen bg-black text-white selection:bg-blue-500/30">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col pl-16">
        {/* Top Header */}
        <header className="sticky top-0 z-40 w-full border-b border-zinc-900 bg-black/80 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between px-6">
            <div className="flex flex-1 items-center gap-4">
              {/* Search Bar */}
              <div className="flex w-full max-w-2xl items-center gap-3 rounded-full bg-zinc-900 px-4 py-2.5 border border-zinc-800 focus-within:ring-1 focus-within:ring-zinc-700 transition-all group hover:bg-zinc-800/80">
                <Search className="size-5 text-zinc-400 group-hover:text-zinc-300" />
                <input
                  type="text"
                  placeholder="Search TrustMarket"
                  className="w-full bg-transparent text-[15px] font-medium text-white placeholder-zinc-500 outline-none"
                />
                <span className="hidden sm:inline-block rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-400 border border-zinc-700">/</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <ConnectButton
                chainStatus="icon"
                showBalance={{ smallScreen: false, largeScreen: true }}
                accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
              />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 px-6 pt-6 pb-16">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
