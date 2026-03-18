import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAccount, useReadContract, useSignMessage } from "wagmi";
import { formatEther, parseEther, keccak256, toHex } from "viem";
import { toast } from "sonner";
import {
  Loader2, ArrowLeft, ImageOff, Tag, ShoppingCart, XCircle, Copy, Check,
  Package, Truck, CheckCircle2, ShieldAlert, Clock, Send, Upload, MapPin,
} from "lucide-react";

function ContractAddressCopy({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied!", { description: address });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-mono text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors w-full"
    >
      <span className="text-zinc-600 mr-1 font-sans font-semibold not-italic text-[0.6rem] uppercase tracking-wider shrink-0">Contract</span>
      <span className="truncate">{address}</span>
      {copied ? <Check className="size-3 text-emerald-400 shrink-0" /> : <Copy className="size-3 shrink-0" />}
    </button>
  );
}

import { useTokenInfo, useNormalListings } from "@/hooks/useCollectionData";
import { useCollectionActions } from "@/hooks/useCollectionActions";
import { usePhygitalListingByToken } from "@/hooks/usePhygitalData";
import { usePhygitalActions } from "@/hooks/usePhygitalActions";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { OrderTimeline } from "@/components/OrderTimeline";
import { StatusBadge } from "@/components/StatusBadge";
import { contracts } from "@/config/contracts";
import { TokenTypeBadge } from "@/components/TokenTypeBadge";
import { TraitGrid } from "@/components/TraitGrid";
import { Button } from "@/components/ui/button";
import { TOKEN_TYPE, TOKEN_STATE, tokenStateLabel, tokenStateStyle, STATUS } from "@/config/contracts";
import { cn } from "@/lib/utils";
import { uploadFileToIPFS, uploadJSONToIPFS, ipfsToHttp } from "@/utils/pinata";
import { encryptForPublicKey, decryptWithSignature, getPublicKeyBase64, SIGN_MESSAGE } from "@/utils/encrypt";

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

export default function TokenDetailPage() {
  const { tokenId: tokenIdParam } = useParams<{ tokenId: string }>();
  const tokenId = tokenIdParam !== undefined ? BigInt(tokenIdParam) : undefined;
  const { address } = useAccount();

  const { tokenInfo, tokenURI, traits, owner, isLoading } = useTokenInfo(tokenId);
  const { metadata } = useTokenMetadata(tokenURI);
  const { listings } = useNormalListings();
  const collectionActions = useCollectionActions();

  // Phygital listing (resolved from tokenId — no route param needed)
  const { listing, isLoading: listingLoading, refetch: refetchListing } = usePhygitalListingByToken(tokenId);
  const phygitalActions = usePhygitalActions();

  const [listPrice, setListPrice] = useState("");
  const [detailTab, setDetailTab] = useState<"timeline" | "actions">("actions");

  // Buyer shipping form
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

  // Dispute evidence
  const [evidenceURI, setEvidenceURI] = useState("");
  const [evidenceMessage, setEvidenceMessage] = useState("");
  const [evidenceUploading, setEvidenceUploading] = useState(false);

  // Seller counter-evidence
  const [sellerEvidenceURI, setSellerEvidenceURI] = useState("");
  const [sellerEvidenceMessage, setSellerEvidenceMessage] = useState("");
  const [sellerEvidenceUploading, setSellerEvidenceUploading] = useState(false);

  // Seller encryption pubkey from contract
  const { data: sellerEncPubkeyRaw } = useReadContract({
    address: contracts.phygitalEscrow.address,
    abi: contracts.phygitalEscrow.abi,
    functionName: "sellerEncryptionPubkeys",
    args: [listing?.seller ?? ZERO],
    query: { enabled: !!listing && listing.seller !== ZERO },
  });
  const sellerEncPubkey = typeof sellerEncPubkeyRaw === "string" ? sellerEncPubkeyRaw : "";

  const { signMessageAsync } = useSignMessage();

  // JuryDAO caseId for disputed listings
  const { data: caseIdRaw } = useReadContract({
    address: contracts.juryDao.address,
    abi: contracts.juryDao.abi,
    functionName: "listingCaseId",
    args: [listing?.id ?? 0n],
    query: { enabled: !!listing && listing.status === STATUS.DISPUTED },
  });
  const disputeCaseId = typeof caseIdRaw === "bigint" ? caseIdRaw : undefined;

  const { data: caseDataRaw, refetch: refetchCaseData } = useReadContract({
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

  const isOwner = address && owner ? address.toLowerCase() === owner.toLowerCase() : false;

  // Find active normal listing for this token
  const activeListing = tokenInfo
    ? listings.find((l) => l.tokenId === tokenInfo.tokenId && l.active)
    : undefined;

  const isSeller = listing && address ? address.toLowerCase() === listing.seller.toLowerCase() : false;
  const isBuyer = listing && address ? address.toLowerCase() === listing.buyer.toLowerCase() : false;

  const { data: disputeFeeData } = useReadContract({
    address: contracts.phygitalEscrow.address,
    abi: contracts.phygitalEscrow.abi,
    functionName: "calcDisputeFee",
    args: listing ? [listing.price] : undefined,
    query: { enabled: Boolean(listing) },
  });
  const disputeFeeEth = disputeFeeData ? formatEther(disputeFeeData as bigint) : "…";

  const runNormal = async (label: string, task: () => Promise<`0x${string}`>) => {
    try {
      const txHash = await task();
      toast.success(label, { description: `TX: ${txHash.slice(0, 20)}...` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(label, { description: msg.slice(0, 140) });
    }
  };

  const run = async (label: string, task: () => Promise<`0x${string}`>) => {
    try {
      const txHash = await task();
      toast.success(label, { description: `TX: ${txHash.slice(0, 20)}...` });
      refetchListing();
      void refetchCaseData();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
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

  const fetchShippingInfo = async (uri: string) => {
    setShippingInfoLoading(true);
    try {
      const res = await fetch(ipfsToHttp(uri));
      const data = (await res.json()) as Record<string, unknown>;
      if (data.encrypted === true && typeof data.ciphertext === "string" && address) {
        setShippingInfoData({ _encrypted: "true" });
      } else {
        setShippingInfoData(data as Record<string, string>);
      }
    } catch {
      toast.error("Failed to load shipping info");
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
      toast.success("Decrypted successfully");
    } catch (err) {
      toast.error("Decryption failed", {
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

  const handleEvidenceUpload = async (file: File) => {
    setEvidenceUploading(true);
    try {
      const uri = await uploadFileToIPFS(file);
      setEvidenceURI(uri);
      toast.success("Evidence uploaded", { description: uri });
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setEvidenceUploading(false);
    }
  };

  const handleSellerEvidenceUpload = async (file: File) => {
    setSellerEvidenceUploading(true);
    try {
      const uri = await uploadFileToIPFS(file);
      setSellerEvidenceURI(uri);
      toast.success("Evidence uploaded", { description: uri });
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSellerEvidenceUploading(false);
    }
  };

  if (isLoading || listingLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-7 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!tokenInfo) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm text-zinc-500">NFT not found.</p>
        <Link to="/app/explore" className="mt-3 text-sm text-blue-400 hover:text-blue-300">Back to explore</Link>
      </div>
    );
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const stateStyle = tokenStateStyle[tokenInfo.state] ?? tokenStateStyle[0];
  const isNormal = tokenInfo.tokenType === TOKEN_TYPE.NORMAL;
  const isPhygital = tokenInfo.tokenType === TOKEN_TYPE.PHYGITAL;

  // Redeem window check — used to enable/disable Redeem button
  const redeemWindowOpen =
    tokenInfo.redeemStart > 0n &&
    tokenInfo.redeemEnd > 0n &&
    tokenInfo.redeemStart <= now &&
    now <= tokenInfo.redeemEnd;

  return (
    <section className="space-y-6">
      {/* Back link */}
      <Link to={`/app/collection/${tokenInfo.setId}`} className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors">
        <ArrowLeft className="size-3.5" /> Collection #{tokenInfo.setId.toString()}
      </Link>

      <div className="grid gap-8 lg:grid-cols-2 items-start">
        {/* Left: Image */}
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <div className="relative aspect-square overflow-hidden bg-zinc-800">
            {metadata?.imageHttp ? (
              <img src={metadata.imageHttp} alt={metadata.name ?? "token"} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                <ImageOff className="size-16 text-zinc-700" />
              </div>
            )}
          </div>
        </div>

        {/* Right: Details */}
        <div className="space-y-6">
          {/* Title + Badges */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TokenTypeBadge tokenType={tokenInfo.tokenType} />
              <span className={cn("rounded-md px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider", stateStyle.bg, stateStyle.text)}>
                {tokenStateLabel[tokenInfo.state]}
              </span>
              {isPhygital && listing && <StatusBadge status={listing.status} />}
            </div>
            <h1 className="text-3xl font-bold text-white">{metadata?.name ?? `NFT #${tokenInfo.tokenId}`}</h1>
            {metadata?.description && <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{metadata.description}</p>}
          </div>

          {/* Price + Owner Info */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            {(tokenInfo.price > 0n || (listing && listing.price > 0n)) && (
              <div>
                <p className="text-[0.65rem] uppercase tracking-widest text-zinc-500">Current Price</p>
                <p className="text-2xl font-bold text-white font-mono">
                  {formatEther(listing ? listing.price : tokenInfo.price)} ETH
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-zinc-500">Owner</p>
                <p className="font-mono text-zinc-300">{owner ? `${owner.slice(0, 6)}...${owner.slice(-4)}` : "—"}</p>
              </div>
              <div>
                <p className="text-zinc-500">Creator</p>
                <p className="font-mono text-zinc-300">{tokenInfo.creator.slice(0, 6)}...{tokenInfo.creator.slice(-4)}</p>
              </div>
              <div>
                <p className="text-zinc-500">NFT ID</p>
                <p className="font-mono text-zinc-300">#{tokenInfo.tokenId.toString()}</p>
              </div>
              <div>
                <p className="text-zinc-500">Set</p>
                <Link to={`/app/collection/${tokenInfo.setId}`} className="font-mono text-blue-400 hover:text-blue-300">
                  #{tokenInfo.setId.toString()}
                </Link>
              </div>
            </div>

            <ContractAddressCopy address={contracts.marketCollection.address} />

            {/* Normal token actions */}
            {isNormal && (
              <div className="space-y-3 pt-2">
                {isOwner && tokenInfo.state === TOKEN_STATE.ACTIVE && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Price in ETH"
                      value={listPrice}
                      onChange={(e) => setListPrice(e.target.value)}
                      className="field-input mono flex-1"
                    />
                    <Button
                      disabled={collectionActions.isPending || !listPrice}
                      onClick={() => runNormal("List NFT", () => collectionActions.listNormalToken(tokenInfo.tokenId, parseEther(listPrice)))}
                    >
                      <Tag className="mr-1.5 size-3.5" /> List
                    </Button>
                  </div>
                )}
                {isOwner && activeListing && (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={collectionActions.isPending}
                    onClick={() => runNormal("Cancel Listing", () => collectionActions.cancelNormalListing(activeListing.id))}
                  >
                    <XCircle className="mr-1.5 size-3.5" /> Cancel Listing
                  </Button>
                )}
                {!isOwner && activeListing && (
                  <Button
                    className="w-full"
                    disabled={collectionActions.isPending}
                    onClick={() => runNormal("Buy NFT", () => collectionActions.buyNormalToken(activeListing.id, activeListing.price))}
                  >
                    <ShoppingCart className="mr-1.5 size-3.5" /> Buy for {formatEther(activeListing.price)} ETH
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Phygital Redeem Window */}
          {isPhygital && (tokenInfo.redeemStart > 0n || tokenInfo.redeemEnd > 0n) && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Redeem Window</h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-zinc-500">Opens</p>
                  <p className="font-mono text-zinc-300">
                    {tokenInfo.redeemStart > 0n ? new Date(Number(tokenInfo.redeemStart) * 1000).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Closes</p>
                  <p className="font-mono text-zinc-300">
                    {tokenInfo.redeemEnd > 0n ? new Date(Number(tokenInfo.redeemEnd) * 1000).toLocaleDateString() : "—"}
                  </p>
                </div>
              </div>
              {!redeemWindowOpen && now < tokenInfo.redeemStart && (
                <p className="mt-2 text-[0.65rem] text-yellow-500">Redeem window has not opened yet.</p>
              )}
              {!redeemWindowOpen && tokenInfo.redeemEnd > 0n && now > tokenInfo.redeemEnd && (
                <p className="mt-2 text-[0.65rem] text-rose-400">Redeem window has closed.</p>
              )}
            </div>
          )}

          {/* Phygital: Order Timeline + Actions — nằm ngay dưới Redeem Window */}
          {isPhygital && listing && (
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
                          disabled={phygitalActions.isPending}
                          onClick={() => run("Cancel Listing", () => phygitalActions.cancelListing(listing.id))}
                        >
                          <XCircle className="mr-1.5 size-3.5" /> Cancel Listing
                        </Button>
                      )}
                      {!isSeller && (
                        <Button
                          className="w-full"
                          disabled={phygitalActions.isPending}
                          onClick={() => run("Buy Item", () => phygitalActions.buyItem(listing.id, listing.price))}
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
                            placeholder="Nguyen Van A"
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
                              className="field-input !w-28 shrink-0"
                            >
                              {COUNTRY_CODES.map((c) => (
                                <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                              ))}
                            </select>
                            <input
                              className="field-input flex-1 min-w-0"
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
                      {!redeemWindowOpen && tokenInfo.redeemStart > 0n && now < tokenInfo.redeemStart && (
                        <p className="text-xs text-yellow-500">Redeem window has not opened yet.</p>
                      )}
                      {!redeemWindowOpen && tokenInfo.redeemEnd > 0n && now > tokenInfo.redeemEnd && (
                        <p className="text-xs text-rose-400">Redeem window has closed — you can no longer redeem.</p>
                      )}
                      <Button
                        className="w-full"
                        disabled={
                          phygitalActions.isPending ||
                          !buyerName.trim() ||
                          !buyerPhone.trim() ||
                          !buyerAddress.trim() ||
                          !redeemWindowOpen
                        }
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
                            void run("Redeem Item", () => phygitalActions.redeemItem(listing.id, hash, shippingURI));
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

                  {/* REDEEMED: Seller confirms shipped / expire after deadline */}
                  {listing.status === STATUS.REDEEMED && (
                    <div className="space-y-3">
                      {isSeller && (
                        <div className="space-y-3 rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4">
                          <h4 className="flex items-center gap-1.5 text-xs font-bold text-zinc-300">
                            <Truck className="size-3.5" /> Confirm Shipment
                          </h4>

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

                          <div className="flex gap-2">
                            <select
                              value={trackingCarrier}
                              onChange={(e) => setTrackingCarrier(e.target.value)}
                              className="field-input !w-36 shrink-0"
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
                            disabled={phygitalActions.isPending || !trackingNumber.trim() || shippingProofUploading}
                            onClick={async () => {
                              try {
                                const proofMeta = await uploadJSONToIPFS({
                                  carrier: trackingCarrier,
                                  trackingNumber: trackingNumber.trim(),
                                  proofURI: shippingProofURI || "",
                                });
                                void run("Confirm Shipped", () => phygitalActions.confirmShipped(listing.id, proofMeta));
                              } catch (err) {
                                toast.error("Upload failed", {
                                  description: err instanceof Error ? err.message : "Unknown error",
                                });
                              }
                            }}
                          >
                            {phygitalActions.isPending
                              ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" /> Processing…</>
                              : <><Truck className="mr-1.5 size-3.5" /> Confirm Shipped</>}
                          </Button>
                        </div>
                      )}
                      {isBuyer && (
                        <div className="space-y-3">
                          {/* Shipping deadline passed → free refund option */}
                          {listing.shippingDeadline > 0n && now > listing.shippingDeadline && (
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 space-y-3">
                              <h4 className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                                <CheckCircle2 className="size-3.5" /> Seller Did Not Ship
                              </h4>
                              <p className="text-xs text-zinc-400">
                                The shipping deadline has passed. You can claim a full refund for free, or raise a dispute if you want a jury ruling.
                              </p>
                              <Button
                                className="w-full"
                                disabled={phygitalActions.isPending}
                                onClick={() => run("Claim Refund", () => phygitalActions.expireShipping(listing.id))}
                              >
                                <CheckCircle2 className="mr-1.5 size-3.5" /> Claim Refund (Free)
                              </Button>
                            </div>
                          )}

                          {/* Raise dispute form (available in REDEEMED even before deadline) */}
                          <div className="space-y-3 rounded-xl border border-rose-500/20 bg-rose-950/10 p-4">
                            <h4 className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                              <ShieldAlert className="size-3.5" /> Raise Dispute
                            </h4>
                            <p className="text-xs text-zinc-400">
                              {listing.shippingDeadline > 0n && now <= listing.shippingDeadline
                                ? "Seller hasn't shipped yet. If you believe this is fraud, submit evidence to a jury."
                                : "Submit evidence to get a formal jury ruling instead of automatic refund."}
                            </p>
                            <div className="field-group">
                              <label className="field-label">Message</label>
                              <textarea
                                className="field-input resize-none"
                                rows={3}
                                placeholder="Describe the issue..."
                                value={evidenceMessage}
                                onChange={(e) => setEvidenceMessage(e.target.value)}
                              />
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
                            </div>
                            <p className="text-[0.7rem] text-zinc-400">
                              Required fee: <span className="font-mono text-amber-400">{disputeFeeEth} ETH</span>
                            </p>
                            <Button
                              variant="destructive"
                              className="w-full"
                              disabled={phygitalActions.isPending || !evidenceURI.trim() || evidenceUploading}
                              onClick={() => run("Raise Dispute", async () => {
                                const jsonURI = await uploadJSONToIPFS({ message: evidenceMessage.trim(), fileURI: evidenceURI });
                                const hash = keccak256(toHex(jsonURI)) as `0x${string}`;
                                return phygitalActions.raiseDispute(listing.id, hash, jsonURI, listing.price);
                              })}
                            >
                              <ShieldAlert className="mr-1.5 size-3.5" /> Submit Dispute (requires fee)
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SHIPPED: Settle or Dispute */}
                  {listing.status === STATUS.SHIPPED && (
                    <div className="space-y-3">
                      {listing.disputeDeadline > 0n && now > listing.disputeDeadline && (
                        <Button
                          className="w-full"
                          disabled={phygitalActions.isPending}
                          onClick={() => run("Settle", () => phygitalActions.settle(listing.id))}
                        >
                          <CheckCircle2 className="mr-1.5 size-3.5" /> Settle (finalize sale)
                        </Button>
                      )}
                      {isBuyer && listing.disputeDeadline > 0n && now <= listing.disputeDeadline && (
                        <>
                          <Button
                            className="w-full"
                            disabled={phygitalActions.isPending}
                            onClick={() => run("Confirm Received", () => phygitalActions.confirmReceived(listing.id))}
                          >
                            <CheckCircle2 className="mr-1.5 size-3.5" /> I Have Received My Item
                          </Button>
                          <div className="space-y-3 rounded-xl border border-rose-500/20 bg-rose-950/10 p-4">
                            <h4 className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                              <ShieldAlert className="size-3.5" /> Raise Dispute
                            </h4>
                            <div className="field-group">
                              <label className="field-label">Message</label>
                              <textarea
                                className="field-input resize-none"
                                rows={3}
                                placeholder="Describe the issue..."
                                value={evidenceMessage}
                                onChange={(e) => setEvidenceMessage(e.target.value)}
                              />
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
                            </div>
                            <p className="text-[0.7rem] text-zinc-400">
                              Required fee: <span className="font-mono text-amber-400">{disputeFeeEth} ETH</span>
                            </p>
                            <Button
                              variant="destructive"
                              className="w-full"
                              disabled={phygitalActions.isPending || !evidenceURI.trim() || evidenceUploading}
                              onClick={() => run("Raise Dispute", async () => {
                                const jsonURI = await uploadJSONToIPFS({ message: evidenceMessage.trim(), fileURI: evidenceURI });
                                const hash = keccak256(toHex(jsonURI)) as `0x${string}`;
                                return phygitalActions.raiseDispute(listing.id, hash, jsonURI, listing.price);
                              })}
                            >
                              {evidenceUploading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <ShieldAlert className="mr-1.5 size-3.5" />} Submit Dispute (requires fee)
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* SOLD: Expire Redeem (after redeemEnd) */}
                  {listing.status === STATUS.SOLD && tokenInfo.redeemEnd > 0n && now > tokenInfo.redeemEnd && (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={phygitalActions.isPending}
                      onClick={() => run("Expire Redeem", () => phygitalActions.expireRedeem(listing.id))}
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
                          <div className="field-group">
                            <label className="field-label">Message</label>
                            <textarea
                              className="field-input resize-none"
                              rows={3}
                              placeholder="Explain your side..."
                              value={sellerEvidenceMessage}
                              onChange={(e) => setSellerEvidenceMessage(e.target.value)}
                            />
                          </div>
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
                            disabled={phygitalActions.isPending || !sellerEvidenceURI.trim() || sellerEvidenceUploading || disputeCaseId === undefined}
                            onClick={() => {
                              if (disputeCaseId !== undefined) {
                                void run("Submit Counter-Evidence", async () => {
                                  const jsonURI = await uploadJSONToIPFS({ message: sellerEvidenceMessage.trim(), fileURI: sellerEvidenceURI });
                                  const hash = keccak256(toHex(jsonURI)) as `0x${string}`;
                                  return phygitalActions.submitCounterEvidence(disputeCaseId, hash, jsonURI);
                                });
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
          )}

          {/* Traits */}
          {traits.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Traits</h3>
              <TraitGrid traits={traits} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
