import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { contracts, isContractReady } from "@/config/contracts";

export function useJuryActions() {
  const { data: hash, isPending, writeContractAsync } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const ready = isContractReady(contracts.juryDao.address);

  const ensureReady = () => {
    if (!ready) throw new Error("JuryDAO contract not deployed");
  };

  const registerJuror = async () => {
    ensureReady();
    return writeContractAsync({
      address: contracts.juryDao.address,
      abi: contracts.juryDao.abi,
      functionName: "registerJuror",
    });
  };

  const unregisterJuror = async () => {
    ensureReady();
    return writeContractAsync({
      address: contracts.juryDao.address,
      abi: contracts.juryDao.abi,
      functionName: "unregisterJuror",
    });
  };

  const castVote = async (caseId: bigint, voteForBuyer: boolean, reason: string) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.juryDao.address,
      abi: contracts.juryDao.abi,
      functionName: "castVote",
      args: [caseId, voteForBuyer, reason],
    });
  };

  const finalizeVerdict = async (caseId: bigint) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.juryDao.address,
      abi: contracts.juryDao.abi,
      functionName: "finalizeVerdict",
      args: [caseId],
    });
  };

  const claimReward = async (caseId: bigint) => {
    ensureReady();
    return writeContractAsync({
      address: contracts.juryDao.address,
      abi: contracts.juryDao.abi,
      functionName: "claimReward",
      args: [caseId],
    });
  };

  return {
    ready,
    isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    receipt: receipt.data,
    registerJuror,
    unregisterJuror,
    castVote,
    finalizeVerdict,
    claimReward,
  };
}
