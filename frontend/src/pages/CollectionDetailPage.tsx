import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, Layers, ImageOff, ArrowLeft, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { useTokensBySet, useTokenURIs } from "@/hooks/useCollectionData";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { TokenCard } from "@/components/TokenCard";
import { TOKEN_TYPE } from "@/config/contracts";
import { useReadContract } from "wagmi";
import { contracts, isContractReady } from "@/config/contracts";

function ContractAddressCopy({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied!", { description: address });
  };
  return (
    <button
      onClick={copy}
      className="mt-2 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-mono text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
    >
      <span className="text-zinc-600 mr-1 font-sans font-semibold not-italic text-[0.6rem] uppercase tracking-wider">Contract</span>
      {address}
      {copied ? <Check className="size-3 text-emerald-400 shrink-0" /> : <Copy className="size-3 shrink-0" />}
    </button>
  );
}

type TabKey = "all" | "normal" | "phygital";

export default function CollectionDetailPage() {
  const { setId } = useParams<{ setId: string }>();
  const id = setId !== undefined ? BigInt(setId) : undefined;
  const mcReady = isContractReady(contracts.marketCollection.address);

  const { data: setRaw, isLoading: setLoading } = useReadContract({
    address: contracts.marketCollection.address,
    abi: contracts.marketCollection.abi,
    functionName: "getSet",
    args: id !== undefined ? [id] : undefined,
    query: { enabled: mcReady && id !== undefined },
  });

  const setData = useMemo(() => {
    if (!setRaw || typeof setRaw !== "object") return undefined;
    const r = setRaw as Record<string, unknown>;
    return {
      id: (r.id as bigint) ?? 0n,
      creator: (r.creator as string) ?? "",
      metadataURI: (r.metadataURI as string) ?? "",
      tokenCount: (r.tokenCount as bigint) ?? 0n,
      createdAt: (r.createdAt as bigint) ?? 0n,
    };
  }, [setRaw]);

  const { metadata: setMeta } = useTokenMetadata(setData?.metadataURI || undefined);

  const { tokens, isLoading: tokensLoading } = useTokensBySet(id);
  const tokenIds = useMemo(() => tokens.map((t) => t.tokenId), [tokens]);
  const { uris } = useTokenURIs(tokenIds);

  const [tab, setTab] = useState<TabKey>("all");

  const filtered = useMemo(() => {
    if (tab === "normal") return tokens.filter((t) => t.tokenType === TOKEN_TYPE.NORMAL);
    if (tab === "phygital") return tokens.filter((t) => t.tokenType === TOKEN_TYPE.PHYGITAL);
    return tokens;
  }, [tokens, tab]);

  if (setLoading || tokensLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-7 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!setData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Layers className="mb-3 size-10 text-zinc-700" />
        <p className="text-sm text-zinc-500">Collection not found.</p>
        <Link to="/app/collections" className="mt-3 text-sm text-blue-400 hover:text-blue-300">
          Back to collections
        </Link>
      </div>
    );
  }

  return (
    <section className="space-y-8">
      {/* Back link */}
      <Link to="/app/collections" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors">
        <ArrowLeft className="size-3.5" /> Collections
      </Link>

      {/* Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="relative h-48 overflow-hidden bg-zinc-800">
          {setMeta?.imageHttp ? (
            <img src={setMeta.imageHttp} alt="" className="h-full w-full object-cover opacity-60" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
              <ImageOff className="size-14 text-zinc-700" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
        </div>

        <div className="relative -mt-12 px-6 pb-6">
          <div className="size-20 overflow-hidden rounded-xl border-4 border-zinc-900 bg-zinc-800">
            {setMeta?.imageHttp ? (
              <img src={setMeta.imageHttp} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Layers className="size-8 text-zinc-600" />
              </div>
            )}
          </div>

          <h1 className="mt-3 text-2xl font-bold text-white">{setMeta?.name ?? `Collection #${setData.id}`}</h1>
          {setMeta?.description && <p className="mt-1 max-w-xl text-sm text-zinc-400">{setMeta.description}</p>}
          <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
            <span>by <span className="font-mono text-zinc-400">{setData.creator.slice(0, 6)}...{setData.creator.slice(-4)}</span></span>
            <span className="font-mono">{tokens.length} items</span>
          </div>
          <ContractAddressCopy address={contracts.marketCollection.address} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800">
        {(["all", "normal", "phygital"] as TabKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "relative px-4 pb-3 pt-1 text-sm font-semibold capitalize transition-colors",
              tab === key ? "text-white" : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            {key} ({key === "all" ? tokens.length : key === "normal" ? tokens.filter((t) => t.tokenType === TOKEN_TYPE.NORMAL).length : tokens.filter((t) => t.tokenType === TOKEN_TYPE.PHYGITAL).length})
            {tab === key && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-blue-500" />}
          </button>
        ))}
      </div>

      {/* Token Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-12 text-center">
          <p className="text-sm text-zinc-500">No tokens in this category.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((t) => (
            <TokenCard key={t.tokenId.toString()} token={t} tokenURI={uris.get(t.tokenId.toString())} />
          ))}
        </div>
      )}
    </section>
  );
}
