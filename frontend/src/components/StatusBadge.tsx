import { listingStatusLabel, listingStatusStyle } from "@/config/contracts";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: number }) {
  const label = listingStatusLabel[status] || "UNKNOWN";
  const style = listingStatusStyle[status] || listingStatusStyle[7];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-[0.65rem] font-mono font-semibold tracking-wider uppercase ring-1 ring-inset ring-black/10 dark:ring-white/10",
        style.bg,
        style.text
      )}
    >
      {style.dot && (
        <span className={cn("mr-1.5 size-1.5 rounded-full shrink-0", style.dot)} />
      )}
      {label}
    </span>
  );
}
