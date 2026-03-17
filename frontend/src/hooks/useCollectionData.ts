import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { contracts, isContractReady, TOKEN_TYPE } from "@/config/contracts";

export interface SetData {
  id: bigint;
  creator: string;
  metadataURI: string;
  tokenCount: bigint;
  createdAt: bigint;
}

export interface TokenInfoData {
  tokenId: bigint;
  setId: bigint;
  creator: string;
  tokenType: number;
  price: bigint;
  redeemStart: bigint;
  redeemEnd: bigint;
  state: number;
  mintedAt: bigint;
}

export interface TraitData {
  key: string;
  value: string;
}

export interface NormalListingData {
  id: bigint;
  tokenId: bigint;
  seller: string;
  price: bigint;
  active: boolean;
}

// Coerce unknown contract return values into typed objects
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

function normalizeSet(raw: unknown): SetData {
  const r = toRecord(raw);
  return {
    id: toBigInt(r.id),
    creator: toStr(r.creator),
    metadataURI: toStr(r.metadataURI),
    tokenCount: toBigInt(r.tokenCount),
    createdAt: toBigInt(r.createdAt),
  };
}

function normalizeTokenInfo(raw: unknown): TokenInfoData {
  const r = toRecord(raw);
  return {
    tokenId: toBigInt(r.tokenId),
    setId: toBigInt(r.setId),
    creator: toStr(r.creator),
    tokenType: toNum(r.tokenType),
    price: toBigInt(r.price),
    redeemStart: toBigInt(r.redeemStart),
    redeemEnd: toBigInt(r.redeemEnd),
    state: toNum(r.state),
    mintedAt: toBigInt(r.mintedAt),
  };
}

function normalizeNormalListing(raw: unknown): NormalListingData {
  const r = toRecord(raw);
  return {
    id: toBigInt(r.id),
    tokenId: toBigInt(r.tokenId),
    seller: toStr(r.seller),
    price: toBigInt(r.price),
    active: typeof r.active === "boolean" ? r.active : false,
  };
}

const mcReady = isContractReady(contracts.marketCollection.address);

export function useSetCount() {
  return useReadContract({
    address: contracts.marketCollection.address,
    abi: contracts.marketCollection.abi,
    functionName: "nextSetId",
    query: { enabled: mcReady, refetchInterval: 10_000 },
  });
}

export function useTokenCount() {
  return useReadContract({
    address: contracts.marketCollection.address,
    abi: contracts.marketCollection.abi,
    functionName: "nextTokenId",
    query: { enabled: mcReady, refetchInterval: 10_000 },
  });
}

export function useNormalListingCount() {
  return useReadContract({
    address: contracts.marketCollection.address,
    abi: contracts.marketCollection.abi,
    functionName: "nextNormalListingId",
    query: { enabled: mcReady, refetchInterval: 10_000 },
  });
}

export function useSets() {
  const { data: countData } = useSetCount();
  const count = Number(countData ?? 0n);

  const ids = useMemo(() => Array.from({ length: count }, (_, i) => BigInt(i)), [count]);

  const read = useReadContracts({
    contracts: ids.map((id) => ({
      address: contracts.marketCollection.address,
      abi: contracts.marketCollection.abi,
      functionName: "getSet",
      args: [id],
    })),
    query: { enabled: mcReady && ids.length > 0, refetchInterval: 10_000 },
  });

  const sets = useMemo(
    () =>
      (read.data ?? [])
        .filter((r) => r.status === "success" && r.result !== undefined)
        .map((r) => normalizeSet(r.result)),
    [read.data],
  );

  return { sets, isLoading: read.isLoading, isFetching: read.isFetching };
}

export function useTokenInfo(tokenId: bigint | undefined) {
  const enabled = mcReady && tokenId !== undefined;
  const info = useReadContract({
    address: contracts.marketCollection.address,
    abi: contracts.marketCollection.abi,
    functionName: "getTokenInfo",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled },
  });
  const uri = useReadContract({
    address: contracts.marketCollection.address,
    abi: contracts.marketCollection.abi,
    functionName: "uri",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled },
  });
  const traits = useReadContract({
    address: contracts.marketCollection.address,
    abi: contracts.marketCollection.abi,
    functionName: "getTraits",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled },
  });
  const owner = useReadContract({
    address: contracts.marketCollection.address,
    abi: contracts.marketCollection.abi,
    functionName: "ownerOf",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled },
  });

  return {
    tokenInfo: info.data ? normalizeTokenInfo(info.data) : undefined,
    tokenURI: typeof uri.data === "string" ? uri.data : undefined,
    traits: Array.isArray(traits.data) ? (traits.data as TraitData[]) : [],
    owner: typeof owner.data === "string" ? owner.data : undefined,
    isLoading: info.isLoading || uri.isLoading,
  };
}

export function useAllTokens() {
  const { data: countData } = useTokenCount();
  const count = Number(countData ?? 0n);

  const ids = useMemo(() => Array.from({ length: count }, (_, i) => BigInt(i)), [count]);

  const read = useReadContracts({
    contracts: ids.map((id) => ({
      address: contracts.marketCollection.address,
      abi: contracts.marketCollection.abi,
      functionName: "getTokenInfo",
      args: [id],
    })),
    query: { enabled: mcReady && ids.length > 0, refetchInterval: 10_000 },
  });

  const tokens = useMemo(
    () =>
      (read.data ?? [])
        .filter((r) => r.status === "success" && r.result !== undefined)
        .map((r) => normalizeTokenInfo(r.result)),
    [read.data],
  );

  return { tokens, isLoading: read.isLoading, isFetching: read.isFetching };
}

export function useTokensBySet(setId: bigint | undefined) {
  const { tokens, isLoading, isFetching } = useAllTokens();
  const filtered = useMemo(
    () => (setId !== undefined ? tokens.filter((t) => t.setId === setId) : []),
    [tokens, setId],
  );
  return { tokens: filtered, isLoading, isFetching };
}

export function useNormalListings() {
  const { data: countData } = useNormalListingCount();
  const count = Number(countData ?? 0n);

  const ids = useMemo(
    () => Array.from({ length: count }, (_, i) => BigInt(i)).reverse(),
    [count],
  );

  const read = useReadContracts({
    contracts: ids.map((id) => ({
      address: contracts.marketCollection.address,
      abi: contracts.marketCollection.abi,
      functionName: "getNormalListing",
      args: [id],
    })),
    query: { enabled: mcReady && ids.length > 0, refetchInterval: 10_000 },
  });

  const listings = useMemo(
    () =>
      (read.data ?? [])
        .filter((r) => r.status === "success" && r.result !== undefined)
        .map((r) => normalizeNormalListing(r.result))
        .filter((l) => l.active),
    [read.data],
  );

  return { listings, isLoading: read.isLoading, isFetching: read.isFetching };
}

export function useMyTokens() {
  const { address } = useAccount();
  const { tokens, isLoading, isFetching } = useAllTokens();

  // Read owners for all tokens
  const ownerReads = useReadContracts({
    contracts: tokens.map((t) => ({
      address: contracts.marketCollection.address,
      abi: contracts.marketCollection.abi,
      functionName: "ownerOf",
      args: [t.tokenId],
    })),
    query: { enabled: mcReady && tokens.length > 0, refetchInterval: 10_000 },
  });

  const myTokens = useMemo(() => {
    if (!address || !ownerReads.data) return [];
    const lower = address.toLowerCase();
    return tokens.filter((_, i) => {
      const row = ownerReads.data![i];
      return row.status === "success" && typeof row.result === "string" && row.result.toLowerCase() === lower;
    });
  }, [address, tokens, ownerReads.data]);

  return { myTokens, isLoading: isLoading || ownerReads.isLoading, isFetching };
}

export function useMySets() {
  const { address } = useAccount();
  const { sets, isLoading, isFetching } = useSets();

  const mySets = useMemo(() => {
    if (!address) return [];
    const lower = address.toLowerCase();
    return sets.filter((s) => s.creator.toLowerCase() === lower);
  }, [address, sets]);

  return { mySets, isLoading, isFetching };
}

// Get token URIs for a batch of tokenIds
export function useTokenURIs(tokenIds: bigint[]) {
  const read = useReadContracts({
    contracts: tokenIds.map((id) => ({
      address: contracts.marketCollection.address,
      abi: contracts.marketCollection.abi,
      functionName: "uri",
      args: [id],
    })),
    query: { enabled: mcReady && tokenIds.length > 0, refetchInterval: 30_000 },
  });

  const uris = useMemo(() => {
    const map = new Map<string, string>();
    const results = read.data ?? [];
    tokenIds.forEach((id, i) => {
      const row = results[i];
      if (row?.status === "success" && typeof row.result === "string") {
        map.set(id.toString(), row.result);
      }
    });
    return map;
  }, [tokenIds, read.data]);

  return { uris, isLoading: read.isLoading };
}
