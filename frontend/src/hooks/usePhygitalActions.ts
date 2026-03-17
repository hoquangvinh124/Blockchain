import { usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { isHex, keccak256, toHex } from "viem";
import { contracts, isContractReady } from "@/config/contracts";

function normalizeHex32(value: string): `0x${string}` {
  if (isHex(value) && value.length === 66) return value as `0x${string}`;
  const trimmed = value.startsWith("0x") ? value.slice(2) : value;
  const padded = trimmed.padEnd(64, "0").slice(0, 64);
  return `0x${padded}`;
}

function resolveEvidenceHash(hash: string, uri: string): `0x${string}` {
  const candidate = hash.trim();
  if (candidate.length > 0) return normalizeHex32(candidate);
  return keccak256(toHex(uri.trim()));
}

export function usePhygitalActions() {
  const publicClient = usePublicClient();
  const { data: hash, isPending, writeContractAsync } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const ready = isContractReady(contracts.phygitalEscrow.address);

  const ensureReady = () => {
    if (!ready) throw new Error("PhygitalEscrow contract not deployed");
    if (!publicClient) throw new Error("Wallet client not ready");
  };

  const calcCollateral = async (price: bigint): Promise<bigint> => {
    ensureReady();
    const result = await publicClient!.readContract({
      address: contracts.phygitalEscrow.address,
      abi: contracts.phygitalEscrow.abi,
      functionName: "calcCollateral",
      args: [price],
    });
    return result as bigint;
  };

  const calcDisputeFee = async (price: bigint): Promise<bigint> => {
    ensureReady();
    const result = await publicClient!.readContract({
      address: contracts.phygitalEscrow.address,
      abi: contracts.phygitalEscrow.abi,
      functionName: "calcDisputeFee",
      args: [price],
    });
    return result as bigint;
  };

  const buyItem = async (listingId: bigint, price: bigint) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.phygitalEscrow.address,
      abi: contracts.phygitalEscrow.abi,
      functionName: "buyItem",
      args: [listingId],
      value: price,
    });
  };

  const cancelListing = async (listingId: bigint) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.phygitalEscrow.address,
      abi: contracts.phygitalEscrow.abi,
      functionName: "cancelListing",
      args: [listingId],
    });
  };

  const redeemItem = async (listingId: bigint, shippingInfoHash: `0x${string}`, shippingInfoURI: string) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.phygitalEscrow.address,
      abi: contracts.phygitalEscrow.abi,
      functionName: "redeemItem",
      args: [listingId, shippingInfoHash, shippingInfoURI],
    });
  };

  const confirmShipped = async (listingId: bigint, shippingProofURI: string) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.phygitalEscrow.address,
      abi: contracts.phygitalEscrow.abi,
      functionName: "confirmShipped",
      args: [listingId, shippingProofURI],
    });
  };

  const settle = async (listingId: bigint) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.phygitalEscrow.address,
      abi: contracts.phygitalEscrow.abi,
      functionName: "settle",
      args: [listingId],
    });
  };

  const expireShipping = async (listingId: bigint) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.phygitalEscrow.address,
      abi: contracts.phygitalEscrow.abi,
      functionName: "expireShipping",
      args: [listingId],
    });
  };

  const expireRedeem = async (listingId: bigint) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.phygitalEscrow.address,
      abi: contracts.phygitalEscrow.abi,
      functionName: "expireRedeem",
      args: [listingId],
    });
  };

  const raiseDispute = async (
    listingId: bigint,
    evidenceHash: string,
    evidenceURI: string,
    price: bigint,
  ) => {
    ensureReady();
    const disputeFee = await calcDisputeFee(price);
    return writeContractAsync({
      address: contracts.phygitalEscrow.address,
      abi: contracts.phygitalEscrow.abi,
      functionName: "raiseDispute",
      args: [listingId, resolveEvidenceHash(evidenceHash, evidenceURI), evidenceURI],
      value: disputeFee,
    });
  };

  const submitCounterEvidence = async (
    caseId: bigint,
    evidenceHash: `0x${string}`,
    evidenceURI: string,
  ) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.juryDao.address,
      abi: contracts.juryDao.abi,
      functionName: "submitCounterEvidence",
      args: [caseId, evidenceHash, evidenceURI],
    });
  };

  const publishEncryptionPubkey = async (pubkey: string) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.phygitalEscrow.address,
      abi: contracts.phygitalEscrow.abi,
      functionName: "publishEncryptionPubkey",
      args: [pubkey],
    });
  };

  return {
    ready,
    isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    receipt: receipt.data,
    calcCollateral,
    calcDisputeFee,
    buyItem,
    cancelListing,
    redeemItem,
    confirmShipped,
    settle,
    expireShipping,
    expireRedeem,
    raiseDispute,
    submitCounterEvidence,
    publishEncryptionPubkey,
  };
}
