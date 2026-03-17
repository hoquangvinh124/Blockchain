import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAccount, useReadContract, useSignMessage } from "wagmi";
import { formatEther, keccak256, toHex } from "viem";
import { toast } from "sonner";
import {
  Loader2, ArrowLeft, ShoppingCart, XCircle, Package, Truck, CheckCircle2,
  ShieldAlert, Clock, Send, Upload, MapPin,
} from "lucide-react";

import { usePhygitalListing } from "@/hooks/usePhygitalData";
import { usePhygitalActions } from "@/hooks/usePhygitalActions";
import { useTokenInfo } from "@/hooks/useCollectionData";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { OrderTimeline } from "@/components/OrderTimeline";
import { StatusBadge } from "@/components/StatusBadge";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Button } from "@/components/ui/button";
import { STATUS, contracts } from "@/config/contracts";
import { uploadFileToIPFS, uploadJSONToIPFS, ipfsToHttp } from "@/utils/pinata";
import { encryptForPublicKey, decryptWithSignature, getPublicKeyBase64, SIGN_MESSAGE } from "@/utils/encrypt";
import { cn } from "@/lib/utils";

function shortenAddress(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const ZERO = "0x0000000000000000000000000000000000000000";

const COUNTRY_CODES = [
  { code: "+84", flag: "🇻🇳", name: "VN" },
  { code: "+1",  flag: "🇺🇸", name: "US" },
  { code: "+44", flag: "🇬🇧", name: "GB" },
  { code: "+81", flag: "🇯🇵", name: "JP" },
  { code: "+82", flag: "🇰🇷", name: "KR" },
  { code: "+86", flag: "🇨🇳", name: "CN" },
  { code: "+65", flag: "🇸🇬", name: "SG" },
  { code: "+60", flag: "🇲🇾", name: "MY" },
  { code: "+66", flag: "🇹🇭", name: "TH" },
  { code: "+62", flag: "🇮🇩", name: "ID" },
  { code: "+63", flag: "🇵🇭", name: "PH" },
  { code: "+61", flag: "🇦🇺", name: "AU" },
  { code: "+49", flag: "🇩🇪", name: "DE" },
  { code: "+33", flag: "🇫🇷", name: "FR" },
  { code: "+91", flag: "🇮🇳", name: "IN" },
] as const;

const SHIPPING_CARRIERS = [
  "GHN", "GHTK", "J&T Express", "VietNam Post", "Shopee Express",
  "DHL", "FedEx", "UPS", "Other",
] as const;

export default function PhygitalDetailPage() {
  const { listingId: idParam } = useParams<{ listingId: string }>();
  const listingId = idParam !== undefined ? BigInt(idParam) : undefined;
  const { address } = useAccount();

  const { listing, isLoading, refetch } = usePhygitalListing(listingId);
  const actions = usePhygitalActions();

  const { tokenInfo, tokenURI } = useTokenInfo(listing?.tokenId);
  const { metadata } = useTokenMetadata(tokenURI);

  // Tab active: "timeline" | "actions"
  const [detailTab, setDetailTab] = useState<"timeline" | "actions">("actions");

  // Buyer: structured shipping form
  const [buyerName, setBuyerName] = useState("");
  const [phoneCC, setPhoneCC] = useState("+84");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");

  // Seller: confirm shipped
  const [trackingCarrier, setTrackingCarrier] = useState<string>("GHN");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shippingProofURI, setShippingProofURI] = useState("");
  const [shippingProofUploading, setShippingProofUploading] = useState(false);

  // Seller: shipping info fetched from IPFS
  const [shippingInfoData, setShippingInfoData] = useState<Record<string, string> | null>(null);
  const [shippingInfoLoading, setShippingInfoLoading] = useState(false);
  const [decryptLoading, setDecryptLoading] = useState(false);

  // Look up seller's encryption pubkey from contract
  const { data: sellerEncPubkeyRaw } = useReadContract({
    address: contracts.phygitalEscrow.address,
    abi: contracts.phygitalEscrow.abi,
    functionName: "sellerEncryptionPubkeys",
    args: [listing?.seller ?? ZERO],
    query: { enabled: !!listing && listing.seller !== ZERO },
  });
  const sellerEncPubkey = typeof sellerEncPubkeyRaw === "string" ? sellerEncPubkeyRaw : "";
  const { signMessageAsync } = useSignMessage();

  // Dispute evidence
  const [evidenceHash, setEvidenceHash] = useState("");
  const [evidenceURI, setEvidenceURI] = useState("");
  const [evidenceUploading, setEvidenceUploading] = useState(false);

  // Seller counter-evidence
  const [sellerEvidenceHash, setSellerEvidenceHash] = useState<`0x${string}` | "">("");
  const [sellerEvidenceURI, setSellerEvidenceURI] = useState("");
  const [sellerEvidenceUploading, setSellerEvidenceUploading] = useState(false);

  // Look up the JuryDAO caseId for this listing when it's disputed
  const { data: caseIdRaw } = useReadContract({
    address: contracts.juryDao.address,
    abi: contracts.juryDao.abi,
    functionName: "listingCaseId",
    args: [listing?.id ?? 0n],
    query: { enabled: !!listing && listing.status === STATUS.DISPUTED },
  });
  const disputeCaseId = typeof caseIdRaw === "bigint" ? caseIdRaw : undefined;

  const { data: caseDataRaw } = useReadContract({
    address: contracts.juryDao.address,
    abi: contracts.juryDao.abi,
    functionName: "getCase",
    args: [disputeCaseId ?? 0n],
    query: { enabled: disputeCaseId !== undefined },
  });
  const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
  type CaseResult = { sellerEvidenceHash: `0x${string}`; sellerEvidenceURI: string };
  const caseResult = caseDataRaw as CaseResult | undefined;
  const sellerAlreadySubmittedEvidence = !!caseResult && caseResult.sellerEvidenceHash !== ZERO_BYTES32;

  const handleSellerEvidenceUpload = async (file: File) => {
    setSellerEvidenceUploading(true);
    try {
      const uri = await uploadFileToIPFS(file);
      const hash = keccak256(toHex(uri));
      setSellerEvidenceURI(uri);
      setSellerEvidenceHash(hash as `0x${string}`);
      toast.success("Evidence uploaded", { description: uri });
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSellerEvidenceUploading(false);
    }
  };

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

  const handleShippingProofUpload = async (file: File) => {
    setShippingProofUploading(true);
    try {
      const uri = await uploadFileToIPFS(file);
      setShippingProofURI(uri);
      toast.success("Proof uploaded", { description: uri });
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setShippingProofUploading(false);
    }
  };

  const fetchShippingInfo = async (uri: string) => {
    setShippingInfoLoading(true);
    try {
      const res = await fetch(ipfsToHttp(uri));
      const data = (await res.json()) as Record<string, unknown>;
      if (data.encrypted === true && typeof data.ciphertext === "string" && address) {
        // Nội dung được mã hoá — cần giải mã bằng MetaMask
        setShippingInfoData({ _encrypted: "true" }); // placeholder để show decrypt button
      } else {
        setShippingInfoData(data as Record<string, string>);
      }
    } catch {
      toast.error("Không thể tải thông tin giao hàng");
    } finally {
      setShippingInfoLoading(false);
    }
  };

  const handleDecryptShippingInfo = async (uri: string) => {
    if (!address) return;
    setDecryptLoading(true);
    try {
      const res = await fetch(ipfsToHttp(uri));
      const data = (await res.json()) as { encrypted: boolean; ciphertext: string };
      const signature = await signMessageAsync({ message: SIGN_MESSAGE });
      const decryptedStr = decryptWithSignature(signature, data.ciphertext);
      const parsed = JSON.parse(decryptedStr) as Record<string, string>;
      setShippingInfoData(parsed);
      toast.success("Đã giải mã thành công");
    } catch (err) {
      toast.error("Giải mã thất bại", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setDecryptLoading(false);
    }
  };

  // Auto-load shipping info when seller views a redeemed listing
  useEffect(() => {
    if (isSeller && listing?.shippingInfoURI && !shippingInfoData && !shippingInfoLoading) {
      void fetchShippingInfo(listing.shippingInfoURI);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSeller, listing?.shippingInfoURI]);

  const run = async (label: string, task: () => Promise<`0x${string}`>) => {
    try {
      const txHash = await task();
      toast.success(label, { description: `TX: ${txHash.slice(0, 20)}...` });
      refetch();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      // Surface known contract revert reasons in plain language
      let friendly = msg;
      if (msg.includes("NotEnoughJurors")) {
        friendly = "The JuryDAO pool has fewer than 3 registered jurors. Run the seed-jurors script first.";
      } else if (msg.includes("IncorrectPayment")) {
        friendly = "Dispute fee mismatch. Refresh the page and try again.";
      } else if (msg.includes("NotParticipant")) {
        friendly = "Only the redeemer of this item can raise a dispute.";
      } else if (msg.includes("DisputeDeadlineExpired")) {
        friendly = "The dispute window has closed — deadline has passed.";
      }
      toast.error(label, { description: friendly.slice(0, 200) });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-7 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!listing || listing.seller === ZERO) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm text-zinc-500">Listing not found.</p>
        <Link to="/app/nfts" className="mt-3 text-sm text-blue-400 hover:text-blue-300">Back to market</Link>
      </div>
    );
  }

  const isSeller = address?.toLowerCase() === listing.seller.toLowerCase();
  const isBuyer = address?.toLowerCase() === listing.buyer.toLowerCase();
  const now = BigInt(Math.floor(Date.now() / 1000));

  return (
    <section className="space-y-6">
      <Link to="/app/nfts" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors">
        <ArrowLeft className="size-3.5" /> NFT Market
      </Link>

      <div className="grid gap-8 lg:grid-cols-5">
        {/* Left column: Image */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            <div className="aspect-square bg-zinc-800">
              {metadata?.imageHttp ? (
                <img src={metadata.imageHttp} alt={metadata.name ?? "token"} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                  <Package className="size-16 text-zinc-700" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Details + Actions */}
        <div className="lg:col-span-3 space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-white">
                {metadata?.name ?? `Listing #${listing.id}`}
              </h1>
              <StatusBadge status={listing.status} />
            </div>
            {metadata?.description && (
              <p className="mt-2 text-sm text-zinc-400">{metadata.description}</p>
            )}
          </div>

          {/* Info Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
            <div>
              <p className="text-[0.65rem] uppercase tracking-widest text-zinc-500">Price</p>
              <p className="text-2xl font-bold text-white font-mono">{formatEther(listing.price)} ETH</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-zinc-500">Seller</p>
                <p className="font-mono text-zinc-300">{shortenAddress(listing.seller)}</p>
              </div>
              <div>
                <p className="text-zinc-500">Buyer</p>
                <p className="font-mono text-zinc-300">{listing.buyer !== ZERO ? shortenAddress(listing.buyer) : "—"}</p>
              </div>
              <div>
                <p className="text-zinc-500">Collateral</p>
                <p className="font-mono text-zinc-300">{formatEther(listing.collateral)} ETH</p>
              </div>
              <div>
                <p className="text-zinc-500">NFT</p>
                <Link to={`/app/token/${listing.tokenId}`} className="font-mono text-blue-400 hover:text-blue-300">
                  #{listing.tokenId.toString()}
                </Link>
              </div>
            </div>

            {/* Active deadlines */}
            {listing.shippingDeadline > 0n && listing.status === STATUS.REDEEMED && (
              <CountdownTimer deadline={listing.shippingDeadline} label="Ship by" />
            )}
            {listing.disputeDeadline > 0n && listing.status === STATUS.SHIPPED && (
              <CountdownTimer deadline={listing.disputeDeadline} label="Dispute by" />
            )}
          </div>

          {/* Tabbed section: Order Timeline + Actions */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            {/* Tab navigation */}
            <div className="flex border-b border-zinc-800">
              <button
                onClick={() => setDetailTab("timeline")}
                className={cn(
                  "flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-r border-zinc-800",
                  detailTab === "timeline"
                    ? "bg-zinc-800/70 text-white"
                    : "text-zinc-500 hover:text-white hover:bg-zinc-800/40"
                )}
              >
                Order Timeline
              </button>
              <button
                onClick={() => setDetailTab("actions")}
                className={cn(
                  "flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors",
                  detailTab === "actions"
                    ? "bg-zinc-800/70 text-white"
                    : "text-zinc-500 hover:text-white hover:bg-zinc-800/40"
                )}
              >
                Actions
              </button>
            </div>

            {/* Order Timeline tab */}
            {detailTab === "timeline" && (
              <div className="p-4">
                <OrderTimeline
                  status={listing.status}
                  listedAt={listing.listedAt}
                  soldAt={listing.soldAt}
                  redeemedAt={listing.redeemedAt}
                  shippedAt={listing.shippedAt}
                  shippingDeadline={listing.shippingDeadline}
                  disputeDeadline={listing.disputeDeadline}
                />
              </div>
            )}

            {/* Actions tab */}
            {detailTab === "actions" && (
              <div className="p-5 space-y-4">
                {/* ACTIVE: Buy or Cancel */}
                {listing.status === STATUS.ACTIVE && (
                  <div className="space-y-3">
                    {isSeller && (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={actions.isPending}
                        onClick={() => run("Cancel Listing", () => actions.cancelListing(listing.id))}
                      >
                        <XCircle className="mr-1.5 size-3.5" /> Cancel Listing
                      </Button>
                    )}
                    {!isSeller && (
                      <Button
                        className="w-full"
                        disabled={actions.isPending}
                        onClick={() => run("Buy Item", () => actions.buyItem(listing.id, listing.price))}
                      >
                        <ShoppingCart className="mr-1.5 size-3.5" /> Buy for {formatEther(listing.price)} ETH
                      </Button>
                    )}
                  </div>
                )}

                {/* SOLD: Redeem (buyer) */}
                {listing.status === STATUS.SOLD && isBuyer && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="field-group">
                        <label className="field-label">Full Name *</label>
                        <input
                          className="field-input"
                          placeholder="Nguyễn Văn A"
                          value={buyerName}
                          onChange={(e) => setBuyerName(e.target.value)}
                        />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Phone Number *</label>
                        <div className="flex gap-2">
                          <select
                            value={phoneCC}
                            onChange={(e) => setPhoneCC(e.target.value)}
                            className="field-input w-28 shrink-0"
                          >
                            {COUNTRY_CODES.map((c) => (
                              <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                            ))}
                          </select>
                          <input
                            className="field-input flex-1"
                            placeholder="0901234567"
                            value={buyerPhone}
                            onChange={(e) => setBuyerPhone(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="field-group">
                        <label className="field-label">Detailed Address *</label>
                        <textarea
                          className="field-input resize-none"
                          rows={3}
                          placeholder="House no., street, ward, district, city/province, country"
                          value={buyerAddress}
                          onChange={(e) => setBuyerAddress(e.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-[0.6rem] text-zinc-600">
                      Shipping info will be encrypted before upload — only the seller can decrypt it.
                    </p>
                    <Button
                      className="w-full"
                      disabled={actions.isPending || !buyerName.trim() || !buyerPhone.trim() || !buyerAddress.trim()}
                      onClick={async () => {
                        try {
                          const shippingData = {
                            name: buyerName.trim(),
                            phone: `${phoneCC} ${buyerPhone.trim()}`,
                            address: buyerAddress.trim(),
                            listingId: listing.id.toString(),
                          };
                          let shippingURI: string;
                          const plaintext = JSON.stringify(shippingData);
                          if (sellerEncPubkey) {
                            const ciphertext = encryptForPublicKey(sellerEncPubkey, plaintext);
                            shippingURI = await uploadJSONToIPFS({ encrypted: true, ciphertext });
                          } else {
                            shippingURI = await uploadJSONToIPFS(shippingData);
                          }
                          const hash = keccak256(toHex(plaintext));
                          void run("Redeem Item", () => actions.redeemItem(listing.id, hash, shippingURI));
                        } catch (err) {
                          toast.error("Failed to upload shipping info", {
                            description: err instanceof Error ? err.message : "Unknown error",
                          });
                        }
                      }}
                    >
                      <Package className="mr-1.5 size-3.5" /> Redeem Item
                    </Button>
                  </div>
                )}

                {/* REDEEMED: Seller confirms shipped / Anyone expires after deadline */}
                {listing.status === STATUS.REDEEMED && (
                  <div className="space-y-3">
                    {isSeller && (
                      <div className="space-y-3 rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4">
                        <h4 className="flex items-center gap-1.5 text-xs font-bold text-zinc-300">
                          <Truck className="size-3.5" /> Confirm Shipment
                        </h4>

                        {/* Buyer shipping info */}
                        {listing.shippingInfoURI && (
                          <div className="space-y-1.5">
                            <p className="text-[0.65rem] uppercase tracking-wider text-zinc-500">Buyer&rsquo;s Address</p>
                            {shippingInfoData?._encrypted === "true" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-xs"
                                disabled={decryptLoading}
                                onClick={() => void handleDecryptShippingInfo(listing.shippingInfoURI)}
                              >
                                {decryptLoading
                                  ? <Loader2 className="mr-1.5 size-3 animate-spin" />
                                  : <ShieldAlert className="mr-1.5 size-3.5" />}
                                Decrypt Shipping Info
                              </Button>
                            ) : shippingInfoData ? (
                              <div className="rounded-lg bg-zinc-900 p-3 space-y-1.5 text-xs">
                                <p className="flex gap-2">
                                  <span className="text-zinc-500 w-16 shrink-0">Name</span>
                                  <span className="text-zinc-200">{shippingInfoData.name}</span>
                                </p>
                                <p className="flex gap-2">
                                  <span className="text-zinc-500 w-16 shrink-0">Phone</span>
                                  <span className="text-zinc-200">{shippingInfoData.phone}</span>
                                </p>
                                <p className="flex gap-2">
                                  <span className="text-zinc-500 w-16 shrink-0">Address</span>
                                  <span className="text-zinc-200 break-words">{shippingInfoData.address}</span>
                                </p>
                              </div>
                            ) : (
                              shippingInfoLoading && (
                                <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                                  <Loader2 className="size-3 animate-spin" /> Loading address...
                                </p>
                              )
                            )}
                          </div>
                        )}

                        {/* Carrier + tracking number */}
                        <div className="flex gap-2">
                          <select
                            value={trackingCarrier}
                            onChange={(e) => setTrackingCarrier(e.target.value)}
                            className="field-input w-36 shrink-0"
                          >
                            {SHIPPING_CARRIERS.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <input
                            className="field-input flex-1"
                            placeholder="Tracking number *"
                            value={trackingNumber}
                            onChange={(e) => setTrackingNumber(e.target.value)}
                          />
                        </div>

                        {/* Shipping proof upload */}
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors">
                          <Upload className="size-3.5 shrink-0" />
                          <span>
                            {shippingProofUploading
                              ? "Uploading…"
                              : shippingProofURI
                              ? "Proof uploaded — click to replace"
                              : "Upload shipping proof (optional)"}
                          </span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="sr-only"
                            disabled={shippingProofUploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleShippingProofUpload(file);
                            }}
                          />
                        </label>
                        {shippingProofURI && !shippingProofUploading && (
                          <p className="truncate text-[0.65rem] font-mono text-emerald-400">{shippingProofURI}</p>
                        )}

                        <Button
                          className="w-full"
                          disabled={actions.isPending || !trackingNumber.trim() || shippingProofUploading}
                          onClick={async () => {
                            try {
                              const proofMeta = await uploadJSONToIPFS({
                                carrier: trackingCarrier,
                                trackingNumber: trackingNumber.trim(),
                                proofURI: shippingProofURI || "",
                              });
                              void run("Confirm Shipped", () => actions.confirmShipped(listing.id, proofMeta));
                            } catch (err) {
                              toast.error("Upload failed", {
                                description: err instanceof Error ? err.message : "Unknown error",
                              });
                            }
                          }}
                        >
                          <Truck className="mr-1.5 size-3.5" /> Confirm Shipped
                        </Button>
                      </div>
                    )}
                    {listing.shippingDeadline > 0n && now > listing.shippingDeadline && (
                      <Button
                        variant="destructive"
                        className="w-full"
                        disabled={actions.isPending}
                        onClick={() => run("Expire Shipping", () => actions.expireShipping(listing.id))}
                      >
                        <Clock className="mr-1.5 size-3.5" /> Expire Shipping (refund buyer)
                      </Button>
                    )}
                  </div>
                )}

                {/* SHIPPED: Settle or Dispute */}
                {listing.status === STATUS.SHIPPED && (
                  <div className="space-y-3">
                    {listing.disputeDeadline > 0n && now > listing.disputeDeadline && (
                      <Button
                        className="w-full"
                        disabled={actions.isPending}
                        onClick={() => run("Settle", () => actions.settle(listing.id))}
                      >
                        <CheckCircle2 className="mr-1.5 size-3.5" /> Settle (finalize sale)
                      </Button>
                    )}
                    {isBuyer && listing.disputeDeadline > 0n && now <= listing.disputeDeadline && (
                      <>
                        <Button
                          className="w-full"
                          disabled={actions.isPending}
                          onClick={() => run("Confirm Received", () => actions.settle(listing.id))}
                        >
                          <CheckCircle2 className="mr-1.5 size-3.5" /> I Have Received My Item
                        </Button>
                        <div className="space-y-3 rounded-xl border border-rose-500/20 bg-rose-950/10 p-4">
                          <h4 className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                            <ShieldAlert className="size-3.5" /> Raise Dispute
                          </h4>
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
                          </div>
                          <Button
                            variant="destructive"
                            className="w-full"
                            disabled={actions.isPending || !evidenceURI.trim() || evidenceUploading}
                            onClick={() => run("Raise Dispute", () => actions.raiseDispute(listing.id, evidenceHash, evidenceURI, listing.price))}
                          >
                            {evidenceUploading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <ShieldAlert className="mr-1.5 size-3.5" />} Submit Dispute (requires fee)
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* SOLD: Expire Redeem (after redeemEnd on token) */}
                {listing.status === STATUS.SOLD && tokenInfo && tokenInfo.redeemEnd > 0n && now > tokenInfo.redeemEnd && (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={actions.isPending}
                    onClick={() => run("Expire Redeem", () => actions.expireRedeem(listing.id))}
                  >
                    <Clock className="mr-1.5 size-3.5" /> Expire Redeem Window
                  </Button>
                )}

                {/* DISPUTED: buyer evidence link */}
                {listing.status === STATUS.DISPUTED && listing.disputeEvidenceURI && (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-400">Dispute evidence submitted. Case is with the jury.</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => window.open(ipfsToHttp(listing.disputeEvidenceURI), "_blank")}
                    >
                      <Send className="mr-1.5 size-3.5" /> View Evidence
                    </Button>
                  </div>
                )}

                {/* DISPUTED: Seller counter-evidence */}
                {listing.status === STATUS.DISPUTED && isSeller && (
                  <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-950/10 p-4">
                    <h4 className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                      <ShieldAlert className="size-3.5" /> Counter-Evidence (Seller)
                    </h4>
                    {sellerAlreadySubmittedEvidence ? (
                      <div className="space-y-2">
                        <p className="text-xs text-emerald-400">Your counter-evidence has been submitted to the jury.</p>
                        {caseResult?.sellerEvidenceURI && (
                          <Button variant="secondary" size="sm" className="w-full" onClick={() => window.open(ipfsToHttp(caseResult.sellerEvidenceURI as string), "_blank")}>
                            <Send className="mr-1.5 size-3.5" /> View Your Evidence
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-zinc-400">Submit counter-evidence to dispute the buyer&rsquo;s claim before the jury votes.</p>
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900 p-4 text-xs text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors">
                          <Upload className="size-4 shrink-0" />
                          <span>{sellerEvidenceUploading ? "Uploading…" : sellerEvidenceURI ? "File uploaded — click to replace" : "Choose counter-evidence file"}</span>
                          <input
                            type="file"
                            accept="image/*,video/*,.pdf,.txt,.doc,.docx"
                            className="sr-only"
                            disabled={sellerEvidenceUploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleSellerEvidenceUpload(file);
                            }}
                          />
                        </label>
                        {sellerEvidenceUploading && (
                          <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                            <Loader2 className="size-3 animate-spin" /> Uploading to IPFS…
                          </p>
                        )}
                        <Button
                          variant="outline"
                          className="w-full border-amber-500/40 text-amber-400 hover:border-amber-500 hover:text-amber-300"
                          disabled={actions.isPending || !sellerEvidenceURI.trim() || sellerEvidenceUploading || disputeCaseId === undefined}
                          onClick={() => {
                            if (disputeCaseId !== undefined && sellerEvidenceHash && sellerEvidenceURI) {
                              void run("Submit Counter-Evidence", () =>
                                actions.submitCounterEvidence(disputeCaseId, sellerEvidenceHash as `0x${string}`, sellerEvidenceURI)
                              );
                            }
                          }}
                        >
                          {sellerEvidenceUploading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Send className="mr-1.5 size-3.5" />}
                          Submit Counter-Evidence to Jury
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Terminal states */}
                {(listing.status === STATUS.COMPLETED || listing.status === STATUS.REFUNDED || listing.status === STATUS.CANCELLED || listing.status === STATUS.EXPIRED) && (
                  <p className="text-xs text-zinc-500 text-center py-2">This listing has been finalized. No further actions available.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
