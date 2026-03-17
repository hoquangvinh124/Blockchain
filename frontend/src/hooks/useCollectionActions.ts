import { usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { contracts, isContractReady } from "@/config/contracts";
import type { TraitData } from "./useCollectionData";

export function useCollectionActions() {
  const publicClient = usePublicClient();
  const { data: hash, isPending, writeContractAsync } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const mcReady = isContractReady(contracts.marketCollection.address);
  const peReady = isContractReady(contracts.phygitalEscrow.address);

  const ensureReady = () => {
    if (!mcReady) throw new Error("MarketCollection contract not deployed");
    if (!publicClient) throw new Error("Wallet client not ready");
  };

  const createSet = async (metadataURI: string) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.marketCollection.address,
      abi: contracts.marketCollection.abi,
      functionName: "createSet",
      args: [metadataURI],
    });
  };

  const mintNormal = async (
    setId: bigint,
    tokenURI: string,
    price: bigint,
    traits: TraitData[],
  ) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.marketCollection.address,
      abi: contracts.marketCollection.abi,
      functionName: "mintNormal",
      args: [setId, tokenURI, price, traits],
    });
  };

  // Calc collateral from PhygitalEscrow before calling mintPhygital
  const calcCollateral = async (price: bigint): Promise<bigint> => {
    if (!peReady || !publicClient) throw new Error("PhygitalEscrow not ready");
    const result = await publicClient.readContract({
      address: contracts.phygitalEscrow.address,
      abi: contracts.phygitalEscrow.abi,
      functionName: "calcCollateral",
      args: [price],
    });
    return result as bigint;
  };

  const mintPhygital = async (
    setId: bigint,
    tokenURI: string,
    price: bigint,
    redeemStart: bigint,
    redeemEnd: bigint,
    traits: TraitData[],
    encPubkey: string,
  ) => {
    ensureReady();
    const collateral = await calcCollateral(price);
    const txHash = await writeContractAsync({
      address: contracts.marketCollection.address,
      abi: contracts.marketCollection.abi,
      functionName: "mintPhygital",
      args: [setId, tokenURI, price, redeemStart, redeemEnd, traits, encPubkey],
      value: collateral,
    });
    await publicClient!.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  };

  const listNormalToken = async (tokenId: bigint, price: bigint) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.marketCollection.address,
      abi: contracts.marketCollection.abi,
      functionName: "listNormalToken",
      args: [tokenId, price],
    });
  };

  const buyNormalToken = async (listingId: bigint, price: bigint) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.marketCollection.address,
      abi: contracts.marketCollection.abi,
      functionName: "buyNormalToken",
      args: [listingId],
      value: price,
    });
  };

  const cancelNormalListing = async (listingId: bigint) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.marketCollection.address,
      abi: contracts.marketCollection.abi,
      functionName: "cancelNormalListing",
      args: [listingId],
    });
  };

  const updateSetMetadata = async (setId: bigint, metadataURI: string) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.marketCollection.address,
      abi: contracts.marketCollection.abi,
      functionName: "updateSetMetadata",
      args: [setId, metadataURI],
    });
  };

  const createSetAndMintNormal = async (
    setMetadataURI: string,
    tokenURI: string,
    price: bigint,
    traits: TraitData[],
  ) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.marketCollection.address,
      abi: contracts.marketCollection.abi,
      functionName: "createSetAndMintNormal",
      args: [setMetadataURI, tokenURI, price, traits],
    });
  };

  const createSetAndMintPhygital = async (
    setMetadataURI: string,
    tokenURI: string,
    price: bigint,
    redeemStart: bigint,
    redeemEnd: bigint,
    traits: TraitData[],
    encPubkey: string,
  ) => {
    ensureReady();
    const collateral = await calcCollateral(price);
    const txHash = await writeContractAsync({
      address: contracts.marketCollection.address,
      abi: contracts.marketCollection.abi,
      functionName: "createSetAndMintPhygital",
      args: [setMetadataURI, tokenURI, price, redeemStart, redeemEnd, traits, encPubkey],
      value: collateral,
    });
    await publicClient!.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  };

  return {
    ready: mcReady,
    isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    receipt: receipt.data,
    calcCollateral,
    createSet,
    mintNormal,
    mintPhygital,
    createSetAndMintNormal,
    createSetAndMintPhygital,
    listNormalToken,
    buyNormalToken,
    cancelNormalListing,
    updateSetMetadata,
  };
}
