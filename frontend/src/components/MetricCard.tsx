import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  note?: string;
  accent?: boolean;
}

export function MetricCard({ label, value, note, accent }: MetricCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-[var(--color-surface-0)] p-5 transition-colors",
        accent 
          ? "border-[var(--color-accent)]/30 ring-1 ring-[var(--color-accent)]/20" 
          : "border-[var(--color-border-dim)]"
      )}
    >
      {/* Background glow if accent is active */}
      {accent && (
        <div className="absolute -left-10 -top-10 -z-10 size-32 rounded-full bg-[var(--color-accent)] opacity-10 blur-2xl" />
      )}
      
      <p className="font-mono text-[0.6875rem] font-bold tracking-widest text-[var(--color-text-secondary)] uppercase">
        {label}
      </p>
      
      <div className="mt-3 flex items-baseline gap-2">
        <span className={cn(
          "text-3xl font-bold tracking-tight",
          accent ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-primary)]"
        )}>
          {value}
        </span>
      </div>
      
      {note && (
        <p className="mt-2 font-mono text-[0.625rem] text-[var(--color-text-tertiary)]">
          {note}
        </p>
      )}
    </div>
  );
}
