import { cn } from "@/lib/utils";
import { TOKEN_TYPE, tokenTypeLabel } from "@/config/contracts";

interface TokenTypeBadgeProps {
  tokenType: number;
  className?: string;
}

export function TokenTypeBadge({ tokenType, className }: TokenTypeBadgeProps) {
  const isPhygital = tokenType === TOKEN_TYPE.PHYGITAL;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold tracking-wider uppercase",
        isPhygital
          ? "bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/20"
          : "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", isPhygital ? "bg-purple-400" : "bg-blue-400")} />
      {tokenTypeLabel[tokenType] ?? "Unknown"}
    </span>
  );
}
