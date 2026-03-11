import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ERC20_ABI } from "../abi/erc20";
import { SWAP_ROUTER_ADDRESS } from "../abi/uniswapRouter";

const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

/**
 * Manages ERC-20 token approval for the Uniswap V3 SwapRouter02.
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
      ? [ownerAddress as `0x${string}`, SWAP_ROUTER_ADDRESS]
      : undefined,
    query: { enabled: !isETH && !!ownerAddress },
  });

  const currentAllowance = (allowance as bigint | undefined) ?? 0n;
  const needsApproval = !isETH && requiredAmount !== undefined && requiredAmount > 0n && currentAllowance < requiredAmount;

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
      args: [SWAP_ROUTER_ADDRESS, MAX_UINT256],
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
