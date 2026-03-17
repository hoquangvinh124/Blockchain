import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { Link } from "react-router-dom";
import { formatEther } from "viem";

import { MetricCard } from "@/components/MetricCard";
import { TokenCard } from "@/components/TokenCard";
import { SetCard } from "@/components/SetCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useMyTokens, useMySets, useTokenURIs } from "@/hooks/useCollectionData";
import { useProfilePhygitalListings } from "@/hooks/usePhygitalData";
import { Layers, Package, ShoppingBag, Store, UserCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "tokens" | "collections" | "purchases" | "listings";

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const { myTokens, isLoading: tokensLoading } = useMyTokens();
  const { mySets, isLoading: setsLoading } = useMySets();
  const { purchased, sold, isLoading: phygitalLoading } = useProfilePhygitalListings();

  const tokenIds = useMemo(() => myTokens.map((t) => t.tokenId), [myTokens]);
  const { uris } = useTokenURIs(tokenIds);

  const [tab, setTab] = useState<TabKey>("tokens");
  const isLoading = tokensLoading || setsLoading || phygitalLoading;

  if (!isConnected) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <UserCircle className="size-14 text-zinc-600" />
        <h2 className="text-xl font-bold text-white">Wallet Not Connected</h2>
        <p className="text-zinc-400">Connect your wallet to view your profile.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Profile Header */}
      <div className="flex items-center gap-5">
        <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-xl ring-4 ring-zinc-900">
          <UserCircle className="size-10" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Your Profile</h1>
          <p className="mt-0.5 font-mono text-sm text-zinc-400">
            {address ? `${address.slice(0, 10)}...${address.slice(-8)}` : "\u2014"}
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="My NFTs" value={myTokens.length} note="owned NFTs" />
        <MetricCard label="My Collections" value={mySets.length} note="created sets" />
        <MetricCard label="Purchases" value={purchased.length} note="phygital bought" />
        <MetricCard label="Listings" value={sold.length} note="phygital sold" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800">
        <TabButton active={tab === "tokens"} icon={<Package className="size-4" />} label={`NFTs (${myTokens.length})`} onClick={() => setTab("tokens")} />
        <TabButton active={tab === "collections"} icon={<Layers className="size-4" />} label={`Collections (${mySets.length})`} onClick={() => setTab("collections")} />
        <TabButton active={tab === "purchases"} icon={<ShoppingBag className="size-4" />} label={`Purchases (${purchased.length})`} onClick={() => setTab("purchases")} />
        <TabButton active={tab === "listings"} icon={<Store className="size-4" />} label={`Listings (${sold.length})`} onClick={() => setTab("listings")} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-7 animate-spin text-zinc-500" />
        </div>
      ) : (
        <div className="animate-in fade-in duration-300">
          {tab === "tokens" && (
            myTokens.length === 0 ? (
              <EmptySection message="You don't own any tokens yet.">
                <Link to="/app/explore" className="mt-3 inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors">
                  Browse Marketplace
                </Link>
              </EmptySection>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {myTokens.map((t) => (
                  <TokenCard key={t.tokenId.toString()} token={t} tokenURI={uris.get(t.tokenId.toString())} />
                ))}
              </div>
            )
          )}

          {tab === "collections" && (
            mySets.length === 0 ? (
              <EmptySection message="You haven't created any collections yet.">
                <Link to="/app/create" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors">
                  Create Collection
                </Link>
              </EmptySection>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {mySets.map((s) => (
                  <SetCard key={s.id.toString()} set={s} />
                ))}
              </div>
            )
          )}

          {tab === "purchases" && (
            purchased.length === 0 ? (
              <EmptySection message="No phygital purchases yet.">
                <Link to="/app/phygital" className="mt-3 inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors">
                  Browse Phygital Market
                </Link>
              </EmptySection>
            ) : (
              <div className="grid gap-4">
                {purchased.map((l) => (
                  <Link key={l.id.toString()} to={`/app/token/${l.tokenId}`} className="listing-card hover:border-zinc-600 transition-colors">
                    <div className="listing-header">
                      <div>
                        <p className="text-sm font-bold text-white">Listing #{l.id.toString()}</p>
                        <p className="text-xs text-zinc-500 font-mono">{formatEther(l.price)} ETH</p>
                      </div>
                      <StatusBadge status={l.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}

          {tab === "listings" && (
            sold.length === 0 ? (
              <EmptySection message="You haven't listed any phygital items yet.">
                <Link to="/app/create" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors">
                  Create Phygital NFT
                </Link>
              </EmptySection>
            ) : (
              <div className="grid gap-4">
                {sold.map((l) => (
                  <Link key={l.id.toString()} to={`/app/token/${l.tokenId}`} className="listing-card hover:border-zinc-600 transition-colors">
                    <div className="listing-header">
                      <div>
                        <p className="text-sm font-bold text-white">Listing #{l.id.toString()}</p>
                        <p className="text-xs text-zinc-500 font-mono">{formatEther(l.price)} ETH</p>
                      </div>
                      <StatusBadge status={l.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 px-4 pb-3 pt-1 text-sm font-semibold transition-colors",
        active ? "text-white" : "text-zinc-500 hover:text-zinc-300"
      )}
    >
      {icon}
      {label}
      {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-blue-500" />}
    </button>
  );
}

function EmptySection({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-12 text-center">
      <p className="text-sm text-zinc-500">{message}</p>
      {children}
    </div>
  );
}
