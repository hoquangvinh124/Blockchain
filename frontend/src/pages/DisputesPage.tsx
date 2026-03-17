import { useState, useMemo } from "react";
import type { FormEvent } from "react";
import { formatEther, keccak256, toHex } from "viem";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { Scale, AlertTriangle, ShieldAlert, BadgeInfo, FileText, CheckCircle2, Loader2, Upload, Gavel } from "lucide-react";
import { Link } from "react-router-dom";
import { uploadFileToIPFS } from "@/utils/pinata";

import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { isContractReady, contracts, listingStatusLabel, STATUS } from "@/config/contracts";
import { usePhygitalListings, useProfilePhygitalListings } from "@/hooks/usePhygitalData";
import { usePhygitalActions } from "@/hooks/usePhygitalActions";

function shortenAddress(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function DisputesPage() {
  const { isConnected } = useAccount();
  const { listings } = usePhygitalListings();
  const { purchased, sold } = useProfilePhygitalListings();
  const actions = usePhygitalActions();
  const contractReady = isContractReady(contracts.phygitalEscrow.address);

  const [evidenceHash, setEvidenceHash] = useState("");
  const [evidenceURI, setEvidenceURI] = useState("");
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState("");

  const handleEvidenceUpload = async (file: File) => {
    setEvidenceUploading(true);
    try {
      const uri = await uploadFileToIPFS(file);
      const hash = keccak256(toHex(uri));
      setEvidenceURI(uri);
      setEvidenceHash(hash);
      toast.success("Evidence uploaded", { description: uri });
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setEvidenceUploading(false);
    }
  };

  const disputedListings = useMemo(() => listings.filter((l) => l.status === STATUS.DISPUTED), [listings]);

  const myDisputedSales = useMemo(() => {
    return sold.filter((l) => l.status === STATUS.DISPUTED);
  }, [sold]);

  // Buyer can dispute when SHIPPED (within dispute deadline)
  const myDisputable = useMemo(() => {
    return purchased.filter((l) => l.status === STATUS.SHIPPED);
  }, [purchased]);

  const totalFeeLocked = useMemo(() => {
    return disputedListings.reduce((sum, item) => sum + item.disputeFeeAmount, 0n);
  }, [disputedListings]);

  const run = async (label: string, task: () => Promise<`0x${string}`>) => {
    try {
      const txHash = await task();
      toast.success(label, { description: `TX: ${txHash.slice(0, 20)}...` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(label, { description: msg.slice(0, 140) });
    }
  };

  if (!contractReady) {
    return (
      <section className="space-y-8">
        <div className="section-header">
          <div className="section-icon"><Scale className="size-4" /></div>
          <div>
            <h1 className="section-title">Dispute Center</h1>
          </div>
        </div>
        <div className="empty-state">
          <div className="empty-icon"><AlertTriangle className="size-5" /></div>
          <p className="empty-title">Blockchain connection failed</p>
          <p className="empty-desc">Contract not deployed. Please check your network and deployment scripts.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      {/* Header */}
      <div className="section-header">
        <div className="section-icon"><Scale className="size-4" /></div>
        <div>
          <h1 className="section-title">Dispute Center</h1>
          <p className="section-desc">Raise and track disputes with immutable evidence</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Active Disputes" value={String(disputedListings.length)} note="status: DISPUTED" />
        <MetricCard label="Dispute Fees Locked" value={`${Number(formatEther(totalFeeLocked)).toFixed(4)} ETH`} note="sum(disputeFeeAmount)" accent />
        <MetricCard label="Your Disputable" value={String(myDisputable.length)} note="shipped items" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Raise a dispute */}
        <div className="listing-card">
          <div className="listing-header">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-rose-400" />
              <h2 className="text-sm font-bold text-[var(--color-text-primary)]">Raise Dispute</h2>
            </div>
          </div>

          <div className="listing-body">
            {!isConnected ? (
              <p className="text-sm text-[var(--color-text-tertiary)] bg-[var(--color-surface-hover)] p-4 rounded-xl text-center border border-[var(--color-border-dim)]">
                Connect your wallet to raise a dispute.
              </p>
            ) : myDisputable.length === 0 ? (
              <p className="text-sm text-[var(--color-text-tertiary)] bg-[var(--color-surface-hover)] p-4 rounded-xl border border-[var(--color-border-dim)] text-center">
                You have no items eligible for dispute. Only <span className="text-amber-400 font-mono text-[0.65rem]">SHIPPED</span> items you purchased can be disputed.
              </p>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  if (!selectedListingId) {
                    toast.error("Selection required", { description: "Please select an item to dispute." });
                    return;
                  }
                  const target = myDisputable.find((l) => l.id.toString() === selectedListingId);
                  if (!target) return;
                  void run("Dispute raised", () =>
                    actions.raiseDispute(BigInt(selectedListingId), evidenceHash, evidenceURI, target.price)
                  );
                }}
              >
                <div className="field-group">
                  <label className="field-label">Select Eligible Listing</label>
                  <select
                    className="field-input mono bg-[var(--color-surface-hover)]"
                    value={selectedListingId}
                    onChange={(e) => setSelectedListingId(e.target.value)}
                    required
                  >
                    <option value="" disabled>-- Select listing --</option>
                    {myDisputable.map((item) => (
                      <option key={item.id.toString()} value={item.id.toString()}>
                        Listing #{item.id.toString()} \u2014 {listingStatusLabel[item.status]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label">Attach Evidence File</label>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900 p-4 text-xs text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors">
                    <Upload className="size-4 shrink-0" />
                    <span>{evidenceUploading ? "Uploading…" : evidenceURI ? "File uploaded — click to replace" : "Choose file to upload"}</span>
                    <input
                      type="file"
                      accept="image/*,video/*,.pdf,.txt,.doc,.docx"
                      className="sr-only"
                      disabled={evidenceUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleEvidenceUpload(file);
                      }}
                    />
                  </label>
                  {evidenceUploading && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                      <Loader2 className="size-3 animate-spin" /> Uploading to IPFS…
                    </p>
                  )}
                  {evidenceURI && !evidenceUploading && (
                    <p className="mt-1 truncate text-[0.65rem] font-mono text-emerald-400">{evidenceURI}</p>
                  )}
                </div>

                <div className="pt-2">
                  <Button type="submit" variant="destructive" disabled={actions.isPending || !evidenceURI.trim() || evidenceUploading} className="w-full">
                    {evidenceUploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldAlert className="mr-2 size-4" />} Escalating to JuryDAO requires fee deposit
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Active Cases Viewer */}
        <div className="flex flex-col gap-4">
          {disputedListings.length === 0 ? (
            <div className="empty-state h-full">
              <div className="empty-icon"><CheckCircle2 className="size-5 text-emerald-400" /></div>
              <p className="empty-title">All clear</p>
              <p className="empty-desc">No active disputes requiring arbitration.</p>
            </div>
          ) : (
            disputedListings.map((item) => (
              <div key={item.id.toString()} className="listing-card group">
                <div className="h-1 bg-gradient-to-r from-rose-500/50 to-transparent" />
                <div className="listing-header">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                      Case: Listing #{item.id.toString()}
                    </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                      <BadgeInfo className="size-3 text-rose-400" /> Awaiting Jury Verdict
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="listing-body space-y-1">
                  <div className="data-row">
                    <span className="data-label">Challenger</span>
                    <span className="data-value mono">{shortenAddress(item.challenger)}</span>
                  </div>
                  <div className="data-row">
                    <span className="data-label">Locked Fee</span>
                    <span className="data-value mono">{Number(formatEther(item.disputeFeeAmount)).toFixed(4)} ETH</span>
                  </div>
                  {item.disputeEvidenceURI && (
                    <div className="pt-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border-dim)] hover:border-[var(--color-border-default)]"
                        onClick={() => window.open(item.disputeEvidenceURI, "_blank")}
                      >
                        <FileText className="mr-2 size-3.5" /> View Submitted Evidence
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Seller: Your Disputed Sales */}
      {isConnected && myDisputedSales.length > 0 && (
        <div>
          <div className="section-header mb-4">
            <div className="section-icon"><Gavel className="size-4" /></div>
            <div>
              <h2 className="section-title">Your Disputed Sales</h2>
              <p className="section-desc">Items you sold that have been disputed — submit counter-evidence on the listing page</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myDisputedSales.map((item) => (
              <div key={item.id.toString()} className="listing-card group">
                <div className="h-1 bg-gradient-to-r from-amber-500/50 to-transparent" />
                <div className="listing-header">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Listing #{item.id.toString()}</h3>
                    <p className="mt-0.5 font-mono text-xs text-zinc-500">NFT #{item.tokenId.toString()}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="listing-body space-y-1">
                  <div className="data-row">
                    <span className="data-label">Challenger</span>
                    <span className="data-value mono">{shortenAddress(item.challenger)}</span>
                  </div>
                  <div className="data-row">
                    <span className="data-label">Value</span>
                    <span className="data-value mono">{Number(formatEther(item.price)).toFixed(4)} ETH</span>
                  </div>
                  <div className="pt-2">
                    <Link
                      to={`/app/token/${item.tokenId.toString()}`}
                      className="flex items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs font-semibold text-amber-400 hover:border-amber-500 hover:text-amber-300 transition-colors w-full"
                    >
                      <ShieldAlert className="size-3.5" /> Submit Counter-Evidence
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
