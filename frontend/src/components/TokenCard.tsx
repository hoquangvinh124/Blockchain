import { Link } from "react-router-dom";
import { formatEther } from "viem";
import { Package, ImageOff } from "lucide-react";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { TokenTypeBadge } from "@/components/TokenTypeBadge";
import { tokenStateLabel, tokenStateStyle, TOKEN_STATE } from "@/config/contracts";
import { cn } from "@/lib/utils";
import type { TokenInfoData } from "@/hooks/useCollectionData";

interface TokenCardProps {
  token: TokenInfoData;
  tokenURI?: string;
  linkPrefix?: string;
}

export function TokenCard({ token, tokenURI, linkPrefix = "/app/token" }: TokenCardProps) {
  const { metadata, isLoading } = useTokenMetadata(tokenURI);
  const stateStyle = tokenStateStyle[token.state] ?? tokenStateStyle[0];

  return (
    <Link to={`${linkPrefix}/${token.tokenId}`} className="block group">
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition-all duration-300 hover:border-zinc-600 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40">
        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-zinc-800">
          {isLoading ? (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="size-10 animate-pulse text-zinc-600" />
            </div>
          ) : metadata?.imageHttp ? (
            <img
              src={metadata.imageHttp}
              alt={metadata?.name ?? `NFT #${token.tokenId}`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
              <ImageOff className="size-10 text-zinc-700" />
            </div>
          )}

          {/* Token type badge overlay */}
          <div className="absolute left-2 top-2">
            <TokenTypeBadge tokenType={token.tokenType} />
          </div>

          {/* State badge overlay */}
          {token.state !== TOKEN_STATE.ACTIVE && (
            <div className="absolute right-2 top-2">
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider",
                  stateStyle.bg,
                  stateStyle.text,
                )}
              >
                {tokenStateLabel[token.state]}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-2.5 space-y-1">
          <p className="truncate text-sm font-semibold text-white">
            {metadata?.name ?? `NFT #${token.tokenId}`}
          </p>

          <div className="flex items-center justify-between">
            {token.price > 0n ? (
              <div>
                <p className="text-[0.6rem] uppercase tracking-widest text-zinc-500">Price</p>
                <p className="font-mono text-sm font-bold text-white">
                  {formatEther(token.price)} ETH
                </p>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Not for sale</p>
            )}

            <span className="text-[0.6rem] text-zinc-600 font-mono">
              #{token.tokenId.toString()}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
