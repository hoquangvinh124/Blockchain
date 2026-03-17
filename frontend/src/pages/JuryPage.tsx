import { useState, useMemo, useEffect } from "react";
import { useAccount, useReadContract, useReadContracts, useSignMessage } from "wagmi";
import { toast } from "sonner";
import {
  Users, AlertTriangle, Shield, CheckCircle2, ChevronRight,
  Gavel, ExternalLink, FileText, ArrowLeft, Scale, Lock,
  Zap, Eye, ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/MetricCard";
import { CountdownTimer } from "@/components/CountdownTimer";
import { isContractReady, contracts, STATUS } from "@/config/contracts";
import { usePhygitalListings } from "@/hooks/usePhygitalData";
import { useJuryActions } from "@/hooks/useJuryActions";
import { ipfsToHttp } from "@/utils/pinata";

type EvidenceData = { message?: string; fileURI?: string };

const JUROR_SIGN_MESSAGE =
  "AtsttMarket Jury System\n\nI confirm my intent to register as an impartial juror.\nI will review evidence fairly and vote in good conscience.\n\nThis signature does not cost gas.";

const FEATURES = [
  {
    icon: Scale,
    title: "Impartial Arbitration",
    desc: "Review buyer–seller disputes using on-chain evidence submitted by both parties.",
  },
  {
    icon: Eye,
    title: "Evidence-Based Voting",
    desc: "Cast your verdict based on IPFS-stored proof. Every vote is transparent and immutable.",
  },
  {
    icon: Zap,
    title: "Decentralised Justice",
    desc: "No central authority. Majority rules among randomly selected jurors per case.",
  },
  {
    icon: ShieldCheck,
    title: "Stake Your Reputation",
    desc: "Your voting history is public on-chain. Consistent fairness builds your juror standing.",
  },
];

export default function JuryPage() {
  const { address, isConnected } = useAccount();
  const { listings } = usePhygitalListings();
  const actions = useJuryActions();
  const { signMessageAsync } = useSignMessage();
  const contractReady = isContractReady(contracts.juryDao.address);

  const { data: jurorData, refetch: refetchJurorStatus } = useReadContract({
    address: contracts.juryDao.address,
    abi: contracts.juryDao.abi,
    functionName: "jurors",
    args: address ? [address] : undefined,
    query: { enabled: contractReady && Boolean(address) },
  });

  const jurorArr = jurorData as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean] | undefined;
  const isJuror = jurorArr?.[7] ?? false;

  const disputed = useMemo(() => listings.filter((l) => l.status === STATUS.DISPUTED), [listings]);

  const { data: casesData } = useReadContracts({
    contracts: disputed.map((item) => ({
      address: contracts.juryDao.address,
      abi: contracts.juryDao.abi,
      functionName: "cases",
      args: [item.id],
    })),
    query: { enabled: contractReady && disputed.length > 0 },
  });

  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [voteForBuyer, setVoteForBuyer] = useState(true);
  const [reason, setReason] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  const selectedIdx = useMemo(
    () => disputed.findIndex((l) => l.id.toString() === selectedCaseId),
    [disputed, selectedCaseId],
  );
  const selectedListing = selectedIdx >= 0 ? disputed[selectedIdx] : undefined;
  const selectedCaseData = selectedIdx >= 0
    ? (casesData?.[selectedIdx]?.result as Record<string, unknown> | undefined)
    : undefined;
  const buyerEvidenceURI = selectedListing?.disputeEvidenceURI ?? "";
  const sellerEvidenceURI = typeof selectedCaseData?.sellerEvidenceURI === "string"
    ? selectedCaseData.sellerEvidenceURI : "";
  const voteDeadline = typeof selectedCaseData?.voteDeadline === "bigint"
    ? selectedCaseData.voteDeadline : 0n;

  const [buyerEvidence, setBuyerEvidence] = useState<EvidenceData | null>(null);
  const [sellerEvidence, setSellerEvidence] = useState<EvidenceData | null>(null);

  useEffect(() => {
    setBuyerEvidence(null);
    setSellerEvidence(null);
    if (buyerEvidenceURI) {
      fetch(ipfsToHttp(buyerEvidenceURI))
        .then((r) => r.json())
        .then((d: EvidenceData) => setBuyerEvidence(d))
        .catch(() => setBuyerEvidence({ fileURI: buyerEvidenceURI }));
    }
    if (sellerEvidenceURI) {
      fetch(ipfsToHttp(sellerEvidenceURI))
        .then((r) => r.json())
        .then((d: EvidenceData) => setSellerEvidence(d))
        .catch(() => setSellerEvidence({ fileURI: sellerEvidenceURI }));
    }
  }, [selectedCaseId, buyerEvidenceURI, sellerEvidenceURI]);

  const { data: hasVotedData } = useReadContract({
    address: contracts.juryDao.address,
    abi: contracts.juryDao.abi,
    functionName: "hasVoted",
    args: selectedCaseId && address ? [BigInt(selectedCaseId), address] : undefined,
    query: { enabled: contractReady && Boolean(selectedCaseId) && Boolean(address) },
  });
  const alreadyVoted = (hasVotedData as boolean) ?? false;
  const deadlinePassed = voteDeadline > 0n && BigInt(Math.floor(Date.now() / 1000)) > voteDeadline;

  const run = async (label: string, task: () => Promise<`0x${string}`>) => {
    try {
      const txHash = await task();
      toast.success(label, { description: `TX: ${txHash.slice(0, 20)}...` });
      refetchJurorStatus();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(label, { description: msg.slice(0, 140) });
    }
  };

  const handleBecomeJuror = async () => {
    try {
      setIsRegistering(true);
      await signMessageAsync({ message: JUROR_SIGN_MESSAGE });
      await run("Register as Juror", () => actions.registerJuror());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (!msg.includes("rejected") && !msg.includes("denied")) {
        toast.error("Registration failed", { description: msg.slice(0, 140) });
      }
    } finally {
      setIsRegistering(false);
    }
  };

  /* ── Contract not deployed ──────────────────────────────── */
  if (!contractReady) {
    return (
      <section className="space-y-8">
        <div className="section-header">
          <div className="section-icon"><Users className="size-4" /></div>
          <div><h1 className="section-title">Jury Portal</h1></div>
        </div>
        <div className="empty-state">
          <div className="empty-icon"><AlertTriangle className="size-5" /></div>
          <p className="empty-title">DAO Contract not deployed</p>
          <p className="empty-desc">JuryDAO requires smart contract configuration.</p>
        </div>
      </section>
    );
  }

  /* ── Gated intro — non-juror ────────────────────────────── */
  if (!isJuror) {
    return (
      <div className="relative min-h-[80vh] flex flex-col items-center justify-center overflow-hidden px-4 py-16">

        {/* Background grid decoration */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {/* Faint grid lines */}
          <div className="absolute inset-0"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          {/* Radial glow top-center */}
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-blue-600/10 blur-[120px]" />
          {/* Bottom accent */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-indigo-900/20 blur-[80px]" />
          {/* Decorative corner scales */}
          <div className="absolute top-8 right-8 opacity-[0.04]">
            <Scale className="size-48 text-white" strokeWidth={0.5} />
          </div>
          <div className="absolute bottom-8 left-8 opacity-[0.03]">
            <Gavel className="size-32 text-white" strokeWidth={0.5} />
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-2xl w-full">

          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-mono tracking-widest text-blue-400 uppercase">
            <Lock className="size-3" />
            Restricted Access
          </div>

          {/* Icon */}
          <div className="mb-6 relative">
            <div className="size-20 rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/10 border border-blue-500/20 flex items-center justify-center shadow-[0_0_40px_rgba(59,130,246,0.15)]">
              <Scale className="size-9 text-blue-400" strokeWidth={1.5} />
            </div>
            <div className="absolute -inset-2 rounded-3xl bg-blue-500/5 blur-xl" />
          </div>

          {/* Headline */}
          <h1 className="text-3xl font-bold tracking-tight text-white mb-3"
            style={{ fontFamily: "'Courier New', monospace", letterSpacing: "-0.02em" }}>
            Jury Portal
          </h1>
          <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed mb-2 max-w-md">
            The decentralised arbitration layer for AtsttMarket disputes.
            Only registered jurors can access this portal and vote on active cases.
          </p>
          <p className="text-[var(--color-text-tertiary)] text-xs mb-10 max-w-sm">
            Jurors are selected randomly per dispute using on-chain randomness.
            Each case requires ≥ 2/3 majority to reach a verdict.
          </p>

          {/* Feature grid */}
          <div className="w-full grid grid-cols-2 gap-3 mb-10">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-left hover:border-zinc-700 transition-colors">
                <div className="mb-2 size-7 rounded-lg bg-zinc-800 flex items-center justify-center">
                  <Icon className="size-3.5 text-blue-400" />
                </div>
                <p className="text-xs font-semibold text-white mb-1">{title}</p>
                <p className="text-[0.68rem] text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          {!isConnected ? (
            <p className="text-sm text-zinc-500 border border-zinc-800 rounded-xl px-6 py-3">
              Connect your wallet to apply for juror status.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 w-full max-w-xs">
              <Button
                className="w-full h-11 text-sm font-semibold bg-blue-600 hover:bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.45)] transition-all"
                disabled={isRegistering || actions.isPending}
                onClick={() => void handleBecomeJuror()}
              >
                {isRegistering ? (
                  <span className="flex items-center gap-2">
                    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Registering…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Gavel className="size-4" /> Become a Juror
                  </span>
                )}
              </Button>
              <p className="text-[0.65rem] text-zinc-600 text-center">
                Sign a message to confirm your intent, then one on-chain transaction to register.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Detail view ────────────────────────────────────────── */
  if (selectedCaseId !== "") {
    return (
      <section className="space-y-6">
        {/* Back + Case title */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedCaseId("")}
            className="flex items-center gap-1.5 text-sm text-[var(--color-text-tertiary)] hover:text-white transition-colors"
          >
            <ArrowLeft className="size-4" /> Back to Cases
          </button>
          <span className="text-[var(--color-border-dim)]">|</span>
          <div className="flex items-center gap-2">
            <div className="size-6 bg-rose-500/10 text-rose-400 rounded flex items-center justify-center font-bold text-xs">
              #{selectedCaseId}
            </div>
            <h2 className="text-sm font-bold text-[var(--color-text-primary)]">Case #{selectedCaseId}</h2>
            {selectedListing && (
              <span className="text-xs text-[var(--color-text-tertiary)]">
                — Listing #{selectedListing.id.toString()} · NFT #{selectedListing.tokenId.toString()}
              </span>
            )}
          </div>
        </div>

        {/* Full-screen action panel */}
        <div className="listing-card relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[var(--color-accent)] opacity-[0.03] rounded-bl-full pointer-events-none" />

          <div className="listing-header border-b border-[var(--color-border-dim)] pb-4 mb-6 flex items-center gap-2">
            <Shield className="size-4 text-[var(--color-accent)]" />
            <h2 className="text-sm font-bold text-[var(--color-text-primary)]">Jury Action Panel</h2>
          </div>

          <div className="space-y-6 p-1">

            {/* Evidence */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] border-b border-[var(--color-border-dim)] pb-2 flex items-center gap-1.5">
                <FileText className="size-3.5" /> Evidence
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Buyer evidence */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
                  <p className="text-[0.65rem] text-zinc-500 uppercase font-mono tracking-wider">Buyer</p>
                  {buyerEvidence?.message && (
                    <p className="text-xs text-zinc-300 line-clamp-5 leading-relaxed">{buyerEvidence.message}</p>
                  )}
                  {buyerEvidence?.fileURI ? (
                    <a href={ipfsToHttp(buyerEvidence.fileURI)} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1">
                      <ExternalLink className="size-3 shrink-0" /> View Evidence File
                    </a>
                  ) : buyerEvidenceURI ? (
                    <span className="text-xs text-zinc-600 italic">Loading…</span>
                  ) : (
                    <span className="text-xs text-zinc-600">No file attached</span>
                  )}
                </div>
                {/* Seller evidence */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
                  <p className="text-[0.65rem] text-zinc-500 uppercase font-mono tracking-wider">Seller</p>
                  {sellerEvidence?.message && (
                    <p className="text-xs text-zinc-300 line-clamp-5 leading-relaxed">{sellerEvidence.message}</p>
                  )}
                  {sellerEvidence?.fileURI ? (
                    <a href={ipfsToHttp(sellerEvidence.fileURI)} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1">
                      <ExternalLink className="size-3 shrink-0" /> View Evidence File
                    </a>
                  ) : sellerEvidenceURI ? (
                    <span className="text-xs text-zinc-600 italic">Loading…</span>
                  ) : (
                    <span className="text-xs text-zinc-600">No counter-evidence submitted</span>
                  )}
                </div>
              </div>
            </div>

            {/* Vote Deadline */}
            {voteDeadline > 0n && (
              <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--color-border-dim)] bg-[var(--color-surface-hover)]">
                <span className="text-xs text-[var(--color-text-tertiary)]">Voting window</span>
                {deadlinePassed
                  ? <span className="text-xs text-rose-400 font-mono">Deadline passed</span>
                  : <CountdownTimer deadline={voteDeadline} label="Closes in" className="text-xs" />}
              </div>
            )}

            {/* Vote Form / Confirmation */}
            {alreadyVoted ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-5 py-4">
                <CheckCircle2 className="size-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-400">Vote submitted</p>
                  <p className="text-[0.68rem] text-[var(--color-text-tertiary)]">Your vote has been recorded for this case.</p>
                </div>
              </div>
            ) : !deadlinePassed ? (
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] border-b border-[var(--color-border-dim)] pb-2">
                  Cast Your Vote
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="field-group">
                    <label className="field-label">Vote Direction</label>
                    <select className="field-input bg-[var(--color-surface-hover)]"
                      value={voteForBuyer.toString()}
                      onChange={(e) => setVoteForBuyer(e.target.value === "true")}>
                      <option value="true">Favor Buyer</option>
                      <option value="false">Favor Seller</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Reason</label>
                    <input className="field-input" placeholder="Why did you vote this way?"
                      value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                </div>
                <Button className="w-full" disabled={actions.isPending}
                  onClick={() => run("Cast Vote", () => actions.castVote(BigInt(selectedCaseId), voteForBuyer, reason))}>
                  <Gavel className="mr-2 size-4" /> Cast Vote
                </Button>
              </div>
            ) : null}

            {/* Finalize */}
            {deadlinePassed && (
              <div className="space-y-3 pt-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] border-b border-[var(--color-border-dim)] pb-2">
                  Finalize Case
                </h3>
                <p className="text-[0.68rem] text-[var(--color-text-tertiary)]">
                  Voting period has ended. Anyone can now trigger the final verdict.
                </p>
                <Button variant="destructive" className="w-full" disabled={actions.isPending}
                  onClick={() => run("Declare Verdict", () => actions.finalizeVerdict(BigInt(selectedCaseId)))}>
                  Declare Verdict <Gavel className="ml-2 size-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  /* ── List view (jurors only) ────────────────────────────── */
  return (
    <section className="space-y-8">
      {/* Header */}
      <div className="section-header">
        <div className="section-icon"><Users className="size-4" /></div>
        <div>
          <h1 className="section-title">Jury Portal</h1>
          <p className="section-desc">Arbitrate disputes as a registered juror</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Cases" value={disputed.length} accent />
        <MetricCard label="Jurors Active" value="-" note="Registered pool" />
        <MetricCard label="Total Handled" value="0" note="Resolved disputes" />
      </div>

      {/* Cases grid */}
      {disputed.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><CheckCircle2 className="size-5 text-emerald-400" /></div>
          <p className="empty-title">No pending cases</p>
          <p className="empty-desc">The marketplace is currently dispute-free.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {disputed.map((item, idx) => {
            const cData = casesData?.[idx]?.result as Record<string, unknown> | undefined;
            const totalVotes = cData ? Number(cData.voteCount || 0) : 0;
            const deadline = typeof cData?.voteDeadline === "bigint" ? cData.voteDeadline : 0n;
            const passed = deadline > 0n && BigInt(Math.floor(Date.now() / 1000)) > deadline;
            return (
              <div key={item.id.toString()}
                className="listing-card cursor-pointer hover:border-[var(--color-accent)]/50 transition-colors"
                onClick={() => setSelectedCaseId(item.id.toString())}>
                <div className="listing-header pb-3">
                  <div className="flex items-center gap-2">
                    <div className="size-6 bg-rose-500/10 text-rose-400 rounded flex items-center justify-center font-bold text-xs">
                      #{item.id.toString()}
                    </div>
                    <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Case #{item.id.toString()}</h3>
                  </div>
                  <ChevronRight className="size-4 text-[var(--color-text-tertiary)]" />
                </div>
                <div className="listing-body py-2 space-y-1.5">
                  <div className="data-row">
                    <span className="data-label">NFT</span>
                    <span className="data-value font-mono">#{item.tokenId.toString()}</span>
                  </div>
                  <div className="data-row">
                    <span className="data-label">Votes cast</span>
                    <span className="data-value">{totalVotes} / 3</span>
                  </div>
                  {deadline > 0n && (
                    <div className="data-row">
                      <span className="data-label">Deadline</span>
                      {passed
                        ? <span className="text-xs text-rose-400 font-mono">Passed</span>
                        : <CountdownTimer deadline={deadline} className="text-xs" />}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
