import { CheckCircle2, Circle, Clock, Package, Truck, ShieldAlert, Star, Lock } from "lucide-react";
import { STATUS } from "@/config/contracts";
import { CountdownTimer } from "./CountdownTimer";

interface TimelineStep {
  label: string;
  icon: React.ElementType;
  activeAtStatus: number[];
  completedAtStatus: number[];
}

// V2 flow: Listed -> Sold -> Redeemed -> Shipped -> Settled(Completed)
const STEPS: TimelineStep[] = [
  {
    label: "Listed",
    icon: Package,
    activeAtStatus: [STATUS.ACTIVE],
    completedAtStatus: [STATUS.SOLD, STATUS.REDEEMED, STATUS.SHIPPED, STATUS.DISPUTED, STATUS.COMPLETED, STATUS.REFUNDED, STATUS.EXPIRED, STATUS.CANCELLED],
  },
  {
    label: "Sold",
    icon: Star,
    activeAtStatus: [STATUS.SOLD],
    completedAtStatus: [STATUS.REDEEMED, STATUS.SHIPPED, STATUS.COMPLETED, STATUS.DISPUTED, STATUS.REFUNDED],
  },
  {
    label: "Redeemed",
    icon: Lock,
    activeAtStatus: [STATUS.REDEEMED],
    completedAtStatus: [STATUS.SHIPPED, STATUS.COMPLETED, STATUS.DISPUTED],
  },
  {
    label: "Shipped",
    icon: Truck,
    activeAtStatus: [STATUS.SHIPPED],
    completedAtStatus: [STATUS.COMPLETED],
  },
  {
    label: "Settled",
    icon: CheckCircle2,
    activeAtStatus: [STATUS.COMPLETED],
    completedAtStatus: [],
  },
];

interface OrderTimelineProps {
  status: number;
  listedAt: bigint;
  soldAt: bigint;
  redeemedAt: bigint;
  shippedAt: bigint;
  shippingDeadline: bigint;
  disputeDeadline: bigint;
}

function formatTs(ts: bigint): string {
  if (ts === 0n) return "";
  return new Date(Number(ts) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderTimeline({ status, listedAt, soldAt, redeemedAt, shippedAt, shippingDeadline, disputeDeadline }: OrderTimelineProps) {
  const timestamps = [listedAt, soldAt, redeemedAt, shippedAt, 0n];

  const isDisputed = status === STATUS.DISPUTED;
  const isCancelled = status === STATUS.CANCELLED;
  const isRefunded = status === STATUS.REFUNDED;
  const isExpired = status === STATUS.EXPIRED;

  return (
    <div className="space-y-3">
      {isDisputed && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
          <ShieldAlert className="size-3.5 shrink-0" />
          <span>Dispute opened — awaiting jury verdict</span>
        </div>
      )}
      {(isCancelled || isRefunded || isExpired) && (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400">
          <Clock className="size-3.5 shrink-0" />
          <span>
            {isCancelled ? "Listing cancelled" : isRefunded ? "Buyer refunded" : "Redeem period expired"}
          </span>
        </div>
      )}

      <ol className="relative ml-2 border-l border-zinc-800">
        {STEPS.map((step, i) => {
          const ts = timestamps[i];
          const isCompleted = step.completedAtStatus.includes(status);
          const isActive = step.activeAtStatus.includes(status);
          const Icon = step.icon;

          return (
            <li key={step.label} className="mb-4 ml-5">
              <span
                className={`absolute -left-3 flex size-6 items-center justify-center rounded-full border ${
                  isCompleted
                    ? "border-emerald-500 bg-emerald-950 text-emerald-400"
                    : isActive
                    ? "border-blue-500 bg-blue-950 text-blue-400"
                    : "border-zinc-700 bg-zinc-900 text-zinc-600"
                }`}
              >
                {isCompleted ? <CheckCircle2 className="size-3.5" /> : isActive ? <Icon className="size-3.5 animate-pulse" /> : <Circle className="size-3.5" />}
              </span>
              <div className="flex flex-col">
                <p className={`text-xs font-semibold ${isCompleted ? "text-emerald-400" : isActive ? "text-white" : "text-zinc-500"}`}>
                  {step.label}
                </p>
                {ts !== undefined && ts > 0n && (
                  <p className="text-[0.65rem] text-zinc-600">{formatTs(ts)}</p>
                )}
                {isActive && step.label === "Redeemed" && shippingDeadline > 0n && (
                  <CountdownTimer deadline={shippingDeadline} label="Ship by" className="mt-0.5" />
                )}
                {isActive && step.label === "Shipped" && disputeDeadline > 0n && (
                  <CountdownTimer deadline={disputeDeadline} label="Dispute by" className="mt-0.5" />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
