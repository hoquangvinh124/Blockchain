import { useState, useMemo } from "react";
import { Search, SlidersHorizontal, Loader2, Grid2X2, LayoutGrid, X, ArrowUpDown } from "lucide-react";

import { useAllTokens, useTokenURIs } from "@/hooks/useCollectionData";
import { TokenCard } from "@/components/TokenCard";
import { TOKEN_TYPE, TOKEN_STATE } from "@/config/contracts";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "listed" | "unlisted" | "locked";
type TypeFilter = "all" | "normal" | "phygital";
type PriceSort = "none" | "asc" | "desc";
type GridSize = "sm" | "md" | "lg";

const GRID_COLS: Record<GridSize, string> = {
  sm: "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6",
  md: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
  lg: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
};

export default function NftBrowsePage() {
  const { tokens, isLoading } = useAllTokens();
  const tokenIds = useMemo(() => tokens.map((t) => t.tokenId), [tokens]);
  const { uris } = useTokenURIs(tokenIds);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [priceSort, setPriceSort] = useState<PriceSort>("none");
  const [gridSize, setGridSize] = useState<GridSize>("md");
  const [showFilters, setShowFilters] = useState(true);

  const filtered = useMemo(() => {
    let result = [...tokens];

    // Type filter
    if (typeFilter === "normal") result = result.filter((t) => t.tokenType === TOKEN_TYPE.NORMAL);
    if (typeFilter === "phygital") result = result.filter((t) => t.tokenType === TOKEN_TYPE.PHYGITAL);

    // Status filter
    if (statusFilter === "listed") result = result.filter((t) => t.state === TOKEN_STATE.LISTED);
    if (statusFilter === "unlisted") result = result.filter((t) => t.state === TOKEN_STATE.ACTIVE);
    if (statusFilter === "locked") result = result.filter((t) => t.state === TOKEN_STATE.LOCKED);

    // Search by token ID
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((t) => t.tokenId.toString().includes(q));
    }

    // Price sort
    if (priceSort === "asc") result = [...result].sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
    if (priceSort === "desc") result = [...result].sort((a, b) => (a.price > b.price ? -1 : a.price < b.price ? 1 : 0));

    return result;
  }, [tokens, typeFilter, statusFilter, searchQuery, priceSort]);

  const normalCount = useMemo(() => tokens.filter((t) => t.tokenType === TOKEN_TYPE.NORMAL).length, [tokens]);
  const phygitalCount = useMemo(() => tokens.filter((t) => t.tokenType === TOKEN_TYPE.PHYGITAL).length, [tokens]);
  const listedCount = useMemo(() => tokens.filter((t) => t.state === TOKEN_STATE.LISTED).length, [tokens]);

  const activeFiltersCount = [
    statusFilter !== "all" ? 1 : 0,
    typeFilter !== "all" ? 1 : 0,
    priceSort !== "none" ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  function clearFilters() {
    setStatusFilter("all");
    setTypeFilter("all");
    setPriceSort("none");
    setSearchQuery("");
  }

  return (
    <div className="flex gap-0">
      {/* Filter sidebar */}
      {showFilters && (
        <aside className="w-56 shrink-0 pr-5 space-y-6">
          {/* Stats */}
          <div className="space-y-1.5 text-xs text-zinc-500">
            <p className="font-bold uppercase tracking-wider text-zinc-400">Overview</p>
            <p><span className="text-white font-semibold">{tokens.length}</span> total items</p>
            <p><span className="text-white font-semibold">{normalCount}</span> normal</p>
            <p><span className="text-white font-semibold">{phygitalCount}</span> phygital</p>
            <p><span className="text-white font-semibold">{listedCount}</span> listed</p>
          </div>

          <div className="h-px bg-zinc-800" />

          {/* Status filter */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Status</p>
            <div className="space-y-1">
              {(["all", "listed", "unlisted", "locked"] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    statusFilter === s
                      ? "bg-blue-600/15 text-blue-300 border border-blue-500/30"
                      : "text-zinc-400 hover:bg-zinc-800/70 hover:text-white"
                  )}
                >
                  <span className="capitalize">{s === "all" ? "All Items" : s}</span>
                  {s === "listed" && <span className="text-[0.6rem] text-zinc-500">{listedCount}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-zinc-800" />

          {/* Type filter */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Type</p>
            <div className="space-y-1">
              {(["all", "normal", "phygital"] as TypeFilter[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    typeFilter === t
                      ? "bg-blue-600/15 text-blue-300 border border-blue-500/30"
                      : "text-zinc-400 hover:bg-zinc-800/70 hover:text-white"
                  )}
                >
                  <span className="capitalize">{t === "all" ? "All Types" : t}</span>
                  {t === "normal" && <span className="text-[0.6rem] text-zinc-500">{normalCount}</span>}
                  {t === "phygital" && <span className="text-[0.6rem] text-zinc-500">{phygitalCount}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-zinc-800" />

          {/* Price sort */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Price</p>
            <div className="space-y-1">
              {([
                { val: "none", label: "Default" },
                { val: "asc", label: "Low → High" },
                { val: "desc", label: "High → Low" },
              ] as { val: PriceSort; label: string }[]).map(({ val, label }) => (
                <button
                  key={val}
                  onClick={() => setPriceSort(val)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    priceSort === val
                      ? "bg-blue-600/15 text-blue-300 border border-blue-500/30"
                      : "text-zinc-400 hover:bg-zinc-800/70 hover:text-white"
                  )}
                >
                  <ArrowUpDown className="size-3 shrink-0" /> {label}
                </button>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3">
          {/* Toggle filters */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold border transition-colors",
              showFilters
                ? "bg-blue-600/15 text-blue-300 border-blue-500/30"
                : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-600"
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-blue-600 text-[0.55rem] font-bold text-white">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by NFT ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-zinc-700 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Grid size */}
          <div className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
            <button
              onClick={() => setGridSize("md")}
              className={cn("rounded-lg p-1.5 transition-colors", gridSize === "md" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-white")}
              title="Medium grid"
            >
              <LayoutGrid className="size-3.5" />
            </button>
            <button
              onClick={() => setGridSize("sm")}
              className={cn("rounded-lg p-1.5 transition-colors", gridSize === "sm" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-white")}
              title="Small grid"
            >
              <Grid2X2 className="size-3.5" />
            </button>
          </div>

          {/* Results count */}
          <span className="text-xs text-zinc-500 font-medium shrink-0">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          </span>

          {/* Clear */}
          {activeFiltersCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              <X className="size-3.5" /> Clear
            </button>
          )}
        </div>

        {/* Token grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="size-7 animate-spin text-zinc-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-20 text-center">
            <p className="text-sm text-zinc-500">No tokens match current filters.</p>
            {activeFiltersCount > 0 && (
              <button onClick={clearFilters} className="mt-3 text-xs font-semibold text-blue-400 hover:text-blue-300">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className={`grid gap-3 ${GRID_COLS[gridSize]}`}>
            {filtered.map((t) => (
              <TokenCard key={t.tokenId.toString()} token={t} tokenURI={uris.get(t.tokenId.toString())} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
