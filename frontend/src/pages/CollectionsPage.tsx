import { Layers, Loader2 } from "lucide-react";

import { useSets } from "@/hooks/useCollectionData";
import { SetCard } from "@/components/SetCard";

export default function CollectionsPage() {
  const { sets, isLoading } = useSets();

  return (
    <section className="space-y-8">
      {/* Header */}
      <div className="section-header">
        <div className="section-icon"><Layers className="size-4" /></div>
        <div>
          <h1 className="section-title">Collections</h1>
          <p className="section-desc">Browse all on-chain sets created by sellers</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-7 animate-spin text-zinc-500" />
        </div>
      ) : sets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-16 text-center">
          <Layers className="mb-3 size-10 text-zinc-700" />
          <p className="text-sm text-zinc-500">No collections created yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {sets.map((s) => (
            <SetCard key={s.id.toString()} set={s} />
          ))}
        </div>
      )}
    </section>
  );
}
