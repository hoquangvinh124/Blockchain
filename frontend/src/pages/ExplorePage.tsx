import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, ChevronLeft, ChevronRight, ImageOff } from "lucide-react";

import { useSets, useAllTokens, useTokenURIs } from "@/hooks/useCollectionData";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { SetCard } from "@/components/SetCard";
import { TokenCard } from "@/components/TokenCard";

function HeroBanner({ sets }: { sets: Parameters<typeof SetCard>[0]["set"][] }) {
  const [current, setCurrent] = useState(0);
  const total = sets.length;

  useEffect(() => {
    if (total < 2) return;
    const id = setInterval(() => setCurrent((c) => (c + 1) % total), 5000);
    return () => clearInterval(id);
  }, [total]);

  const set = sets[current];
  const { metadata } = useTokenMetadata(set?.metadataURI || undefined);

  if (!set) {
    return (
      <div className="relative flex h-64 items-center justify-center overflow-hidden rounded-3xl border border-dashed border-zinc-800 bg-zinc-900">
        <p className="text-sm text-zinc-500">No collections yet.</p>
      </div>
    );
  }

  return (
    <div className="relative h-72 md:h-96 overflow-hidden rounded-3xl border border-zinc-800">
      {/* Background image */}
      <div className="absolute inset-0 transition-opacity duration-700">
        {metadata?.imageHttp ? (
          <img src={metadata.imageHttp} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-950 to-zinc-900">
            <ImageOff className="size-16 text-zinc-700" />
          </div>
        )}
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 p-7">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-blue-400">Featured Collection</p>
        <h2 className="text-3xl font-extrabold text-white leading-tight drop-shadow-lg">
          {metadata?.name ?? `Collection #${set.id}`}
        </h2>
        {metadata?.description && (
          <p className="mt-1 max-w-md text-sm text-zinc-300 line-clamp-2">{metadata.description}</p>
        )}
        <div className="mt-4 flex items-center gap-5 text-xs text-zinc-300">
          <span><span className="text-white font-bold">{set.tokenCount.toString()}</span> items</span>
          <span>by <span className="font-mono text-zinc-200">{set.creator.slice(0, 6)}...{set.creator.slice(-4)}</span></span>
        </div>
        <Link
          to={`/app/collection/${set.id}`}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm font-semibold text-white border border-white/20 hover:bg-white/20 transition-colors"
        >
          View Collection <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {/* Arrows */}
      {total > 1 && (
        <>
          <button
            onClick={() => setCurrent((c) => (c - 1 + total) % total)}
            className="absolute left-4 top-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white border border-white/10 hover:bg-black/60 transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => setCurrent((c) => (c + 1) % total)}
            className="absolute right-4 top-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white border border-white/10 hover:bg-black/60 transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
        </>
      )}

      {/* Dots */}
      {total > 1 && (
        <div className="absolute bottom-5 right-6 flex items-center gap-1.5">
          {sets.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === current ? "w-5 bg-white" : "w-1.5 bg-white/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExplorePage() {
  const { sets, isLoading: setsLoading } = useSets();
  const { tokens, isLoading: tokensLoading } = useAllTokens();

  const recentTokens = tokens.slice(0, 10);
  const tokenIds = recentTokens.map((t) => t.tokenId);
  const { uris } = useTokenURIs(tokenIds);

  const trendingSets = sets.slice(0, 6);

  return (
    <section className="space-y-10">

      {/* Hero Banner */}
      {setsLoading ? (
        <div className="flex h-72 md:h-96 items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900">
          <Loader2 className="size-7 animate-spin text-zinc-500" />
        </div>
      ) : (
        <HeroBanner sets={trendingSets} />
      )}

      {/* Trending Collections */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Trending Collections</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Discover popular collections on TrustMarket</p>
          </div>
          <Link to="/app/collections" className="group flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-white transition-colors">
            View all <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {setsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-7 animate-spin text-zinc-500" />
          </div>
        ) : trendingSets.length === 0 ? (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-12 text-center">
            <p className="text-sm text-zinc-500">No collections yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trendingSets.map((s) => (
              <SetCard key={s.id.toString()} set={s} />
            ))}
          </div>
        )}
      </div>

      {/* NFTs */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">NFTs</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Recently minted tokens</p>
          </div>
          <Link to="/app/nfts" className="group flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-white transition-colors">
            View all <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {tokensLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-7 animate-spin text-zinc-500" />
          </div>
        ) : recentTokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-12 text-center">
            <p className="text-sm text-zinc-500">No tokens minted yet.</p>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {recentTokens.map((t) => (
              <TokenCard key={t.tokenId.toString()} token={t} tokenURI={uris.get(t.tokenId.toString())} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
