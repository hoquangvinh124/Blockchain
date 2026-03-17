import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface CountdownTimerProps {
  deadline: bigint; // unix timestamp in seconds
  label?: string;
  expiredLabel?: string;
  className?: string;
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function CountdownTimer({ deadline, label, expiredLabel = "Expired", className = "" }: CountdownTimerProps) {
  const deadlineSec = Number(deadline);
  const [remaining, setRemaining] = useState(() => deadlineSec - Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (deadlineSec === 0) return;
    const id = setInterval(() => {
      setRemaining(deadlineSec - Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [deadlineSec]);

  if (deadlineSec === 0) return null;

  const isExpired = remaining <= 0;
  const isUrgent = remaining > 0 && remaining < 3600;

  return (
    <div className={`flex items-center gap-1.5 text-xs font-mono ${isExpired ? "text-zinc-500" : isUrgent ? "text-rose-400 animate-pulse" : "text-amber-400"} ${className}`}>
      <Clock className="size-3.5 shrink-0" />
      <span>{label && !isExpired ? `${label}: ` : ""}{isExpired ? expiredLabel : formatRemaining(remaining)}</span>
    </div>
  );
}
