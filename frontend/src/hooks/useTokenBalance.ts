import { useReadContract, useBalance } from "wagmi";
import { ERC20_ABI } from "../abi/erc20";
import type { Token } from "../types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Returns the user's balance for a given token.
 * For ETH (zero address), uses native balance. For ERC-20s, uses balanceOf.
 */
export function useTokenBalance(token: Token, userAddress?: string) {
  const isETH = token.address === ZERO_ADDRESS;
  const address = userAddress as `0x${string}` | undefined;

  // Native ETH balance
  const ethBalance = useBalance({
    address,
    query: { enabled: isETH && !!address },
  });

  // ERC-20 balance
  const erc20Balance = useReadContract({
    abi: ERC20_ABI,
    address: token.address as `0x${string}`,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !isETH && !!address },
  });

  if (isETH) {
    return {
      balance: ethBalance.data?.value,
      formatted: ethBalance.data?.formatted,
      isLoading: ethBalance.isLoading,
    };
  }

  const raw = erc20Balance.data as bigint | undefined;
  return {
    balance: raw,
    formatted: raw !== undefined
      ? (Number(raw) / 10 ** token.decimals).toString()
      : undefined,
    isLoading: erc20Balance.isLoading,
  };
}
