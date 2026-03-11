import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ERC20_ABI } from "../abi/erc20";
import { CONTRACTS } from "../config";

const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

/**
 * Manages ERC-20 token approval for the Settlement contract.
 * Returns current allowance, approve function, and pending state.
 */
export function useTokenApproval(
  tokenAddress: string,
  ownerAddress?: string,
  requiredAmount?: bigint,
) {
  const isETH = tokenAddress === "0x0000000000000000000000000000000000000000";

  // Read current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: ERC20_ABI,
    address: tokenAddress as `0x${string}`,
    functionName: "allowance",
    args: ownerAddress
      ? [ownerAddress as `0x${string}`, CONTRACTS.settlement]
      : undefined,
    query: { enabled: !isETH && !!ownerAddress },
  });

  const currentAllowance = (allowance as bigint | undefined) ?? 0n;
  const needsApproval = !isETH && requiredAmount !== undefined && currentAllowance < requiredAmount;

  // Write approve
  const { writeContract, data: txHash, isPending: isApproving } = useWriteContract();

  // Wait for approval tx
  const { isLoading: isConfirming, isSuccess: isApproved } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const approve = () => {
    if (!needsApproval) return;
    writeContract({
      abi: ERC20_ABI,
      address: tokenAddress as `0x${string}`,
      functionName: "approve",
      args: [CONTRACTS.settlement, MAX_UINT256],
    });
  };

  return {
    allowance: currentAllowance,
    needsApproval,
    approve,
    isApproving: isApproving || isConfirming,
    isApproved,
    refetchAllowance,
    approvalTxHash: txHash,
  };
}
