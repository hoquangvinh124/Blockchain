import { Link } from "react-router-dom";
import { ImageOff, Package } from "lucide-react";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import type { SetData } from "@/hooks/useCollectionData";

interface SetCardProps {
  set: SetData;
}

export function SetCard({ set }: SetCardProps) {
  const { metadata, isLoading } = useTokenMetadata(set.metadataURI || undefined);

  return (
    <Link to={`/app/collection/${set.id}`} className="block group">
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition-all duration-300 hover:border-zinc-600 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40">
        {/* Banner image */}
        <div className="relative aspect-[3/2] overflow-hidden bg-zinc-800">
          {isLoading ? (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="size-10 animate-pulse text-zinc-600" />
            </div>
          ) : metadata?.imageHttp ? (
            <img
              src={metadata.imageHttp}
              alt={metadata.name ?? `Collection #${set.id}`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
              <ImageOff className="size-10 text-zinc-700" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-4 space-y-2">
          <h3 className="font-semibold text-white truncate text-sm">
            {metadata?.name ?? `Collection #${set.id}`}
          </h3>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              by {set.creator.slice(0, 6)}...{set.creator.slice(-4)}
            </span>
            <span className="font-mono">{set.tokenCount.toString()} items</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
