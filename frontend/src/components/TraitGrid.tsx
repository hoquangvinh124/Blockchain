import type { TraitData } from "@/hooks/useCollectionData";

interface TraitGridProps {
  traits: TraitData[];
}

export function TraitGrid({ traits }: TraitGridProps) {
  if (traits.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {traits.map((t, i) => (
          <div
            key={i}
            className="flex flex-col items-center rounded-xl border border-blue-500/20 bg-blue-950/20 px-3 py-2.5 text-center"
          >
            <span className="text-[0.6rem] font-bold uppercase tracking-widest text-blue-400">
              {t.key}
            </span>
            <span className="mt-0.5 text-sm font-semibold text-white truncate w-full">
              {t.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
