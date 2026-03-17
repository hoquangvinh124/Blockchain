import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { contracts, isContractReady } from "@/config/contracts";

export interface PhygitalListingData {
  id: bigint;
  tokenId: bigint;
  seller: string;
  buyer: string;
  redeemer: string;
  challenger: string;
  price: bigint;
  collateral: bigint;
  shippingInfoHash: `0x${string}`;
  shippingInfoURI: string;
  shippingProofURI: string;
  listedAt: bigint;
  soldAt: bigint;
  redeemedAt: bigint;
  shippedAt: bigint;
  shippingDeadline: bigint;
  disputeDeadline: bigint;
  disputeOpenedAt: bigint;
  disputeFeeAmount: bigint;
  disputeEvidenceHash: `0x${string}`;
  disputeEvidenceURI: string;
  status: number;
}

function toRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}
function toBigInt(v: unknown): bigint {
  return typeof v === "bigint" ? v : 0n;
}
function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  return 0;
}
function toHex32(v: unknown): `0x${string}` {
  if (typeof v === "string" && v.startsWith("0x")) return v as `0x${string}`;
  return "0x0000000000000000000000000000000000000000000000000000000000000000";
}

function normalizeListing(raw: unknown): PhygitalListingData {
  const r = toRecord(raw);
  return {
    id: toBigInt(r.id),
    tokenId: toBigInt(r.tokenId),
    seller: toStr(r.seller),
    buyer: toStr(r.buyer),
    redeemer: toStr(r.redeemer),
    challenger: toStr(r.challenger),
    price: toBigInt(r.price),
    collateral: toBigInt(r.collateral),
    shippingInfoHash: toHex32(r.shippingInfoHash),
    shippingInfoURI: toStr(r.shippingInfoURI),
    shippingProofURI: toStr(r.shippingProofURI),
    listedAt: toBigInt(r.listedAt),
    soldAt: toBigInt(r.soldAt),
    redeemedAt: toBigInt(r.redeemedAt),
    shippedAt: toBigInt(r.shippedAt),
    shippingDeadline: toBigInt(r.shippingDeadline),
    disputeDeadline: toBigInt(r.disputeDeadline),
    disputeOpenedAt: toBigInt(r.disputeOpenedAt),
    disputeFeeAmount: toBigInt(r.disputeFeeAmount),
    disputeEvidenceHash: toHex32(r.disputeEvidenceHash),
    disputeEvidenceURI: toStr(r.disputeEvidenceURI),
    status: toNum(r.status),
  };
}

const peReady = isContractReady(contracts.phygitalEscrow.address);

export function usePhygitalListingCount() {
  return useReadContract({
    address: contracts.phygitalEscrow.address,
    abi: contracts.phygitalEscrow.abi,
    functionName: "getListingCount",
    query: { enabled: peReady, refetchInterval: 10_000 },
  });
}

export function usePhygitalListings() {
  const { data: countData } = usePhygitalListingCount();
  const count = Number(countData ?? 0n);

  const ids = useMemo(
    () => Array.from({ length: count }, (_, i) => BigInt(i)).reverse(),
    [count],
  );

  const read = useReadContracts({
    contracts: ids.map((id) => ({
      address: contracts.phygitalEscrow.address,
      abi: contracts.phygitalEscrow.abi,
      functionName: "getListing",
      args: [id],
    })),
    query: { enabled: peReady && ids.length > 0, refetchInterval: 10_000 },
  });

  const listings = useMemo(
    () =>
      (read.data ?? [])
        .filter((r) => r.status === "success" && r.result !== undefined)
        .map((r) => normalizeListing(r.result)),
    [read.data],
  );

  return { listings, isLoading: read.isLoading, isFetching: read.isFetching };
}

export function usePhygitalListing(listingId: bigint | undefined) {
  const enabled = peReady && listingId !== undefined;
  const read = useReadContract({
    address: contracts.phygitalEscrow.address,
    abi: contracts.phygitalEscrow.abi,
    functionName: "getListing",
    args: listingId !== undefined ? [listingId] : undefined,
    query: { enabled, refetchInterval: 5_000 },
  });

  return {
    listing: read.data ? normalizeListing(read.data) : undefined,
    isLoading: read.isLoading,
    refetch: read.refetch,
  };
}

// Lookup listing theo tokenId thay vi listingId (dung trong TokenDetailPage).
export function usePhygitalListingByToken(tokenId: bigint | undefined) {
  const { data: listingIdRaw, isLoading: idLoading } = useReadContract({
    address: contracts.phygitalEscrow.address,
    abi: contracts.phygitalEscrow.abi,
    functionName: "listingByToken",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: peReady && tokenId !== undefined, refetchInterval: 5_000 },
  });

  const listingId = typeof listingIdRaw === "bigint" ? listingIdRaw : undefined;

  // Luon fetch ca listing id = 0, roi validate bang seller != zero address
  // vi mapping listingByToken tra ve 0 cho ca "listing #0 that" lan "chua co listing"
  const { listing: rawListing, isLoading: listingLoading, refetch } = usePhygitalListing(listingId);

  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const listing = rawListing && rawListing.seller !== ZERO_ADDR ? rawListing : undefined;

  return {
    listing,
    isLoading: idLoading || listingLoading,
    refetch,
  };
}

export function useProfilePhygitalListings() {
  const { address } = useAccount();
  const { listings, isLoading, isFetching } = usePhygitalListings();

  const profile = useMemo(() => {
    const lower = address?.toLowerCase();
    if (!lower) return { purchased: [] as PhygitalListingData[], sold: [] as PhygitalListingData[] };
    const purchased = listings.filter((l) => l.buyer.toLowerCase() === lower);
    const sold = listings.filter((l) => l.seller.toLowerCase() === lower);
    return { purchased, sold };
  }, [address, listings]);

  return { ...profile, isLoading, isFetching };
}
