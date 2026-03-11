import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { encodeFunctionData, encodePacked } from "viem";
import { SWAP_ROUTER_ABI, SWAP_ROUTER_ADDRESS, WETH_ADDRESS } from "../abi/uniswapRouter";
import { ERC20_ABI } from "../abi/erc20";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Fee tiers for known pairs */
function getFeeTier(symbolA: string, symbolB: string): number {
  const stables = ["USDC", "USDT", "DAI"];
  // Stablecoin ↔ Stablecoin: 0.01%
  if (stables.includes(symbolA) && stables.includes(symbolB)) return 100;
  // ETH ↔ stablecoin: 0.05%
  if ((symbolA === "ETH" && stables.includes(symbolB)) ||
      (symbolB === "ETH" && stables.includes(symbolA))) return 500;
  // ETH ↔ WBTC: 0.3%
  return 3000;
}

/** Resolve token address for on-chain usage (ETH → WETH) */
function resolveAddress(address: string): `0x${string}` {
  if (address === ZERO_ADDRESS) return WETH_ADDRESS;
  return address as `0x${string}`;
}

/** Check if a pair needs multi-hop routing through WETH */
function needsMultiHop(sellSymbol: string, buySymbol: string): boolean {
  // Direct pool exists for: ETH↔anything, stablecoin↔stablecoin
  if (sellSymbol === "ETH" || buySymbol === "ETH") return false;
  const stables = ["USDC", "USDT", "DAI"];
  if (stables.includes(sellSymbol) && stables.includes(buySymbol)) return false;
  // WBTC ↔ stablecoin needs to go through WETH
  return true;
}

export interface SwapParams {
  sellTokenAddress: string;
  buyTokenAddress: string;
  sellSymbol: string;
  buySymbol: string;
  amountIn: bigint;
  amountOutMinimum: bigint;
  recipient: `0x${string}`;
  deadline: bigint;
}

/**
 * Executes a swap via Uniswap V3 SwapRouter02.
 *
 * Handles:
 * - ETH → Token (sends ETH as value, wraps to WETH internally)
 * - Token → ETH (swaps to WETH, then unwraps via multicall)
 * - Token → Token (direct or multi-hop through WETH)
 */
export function useSwap() {
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const swap = (params: SwapParams) => {
    const isSellingETH = params.sellTokenAddress === ZERO_ADDRESS;
    const isBuyingETH = params.buyTokenAddress === ZERO_ADDRESS;
    const tokenIn = resolveAddress(params.sellTokenAddress);
    const tokenOut = resolveAddress(params.buyTokenAddress);
    const multiHop = needsMultiHop(params.sellSymbol, params.buySymbol);

    if (isBuyingETH) {
      // Token → ETH: multicall([exactInputSingle to WETH → Router, unwrapWETH9])
      const fee = getFeeTier(params.sellSymbol, "ETH");
      const swapData = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [{
          tokenIn,
          tokenOut: WETH_ADDRESS,
          fee,
          recipient: SWAP_ROUTER_ADDRESS, // send WETH to router for unwrapping
          amountIn: params.amountIn,
          amountOutMinimum: 0n, // checked in unwrapWETH9
          sqrtPriceLimitX96: 0n,
        }],
      });
      const unwrapData = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: "unwrapWETH9",
        args: [params.amountOutMinimum, params.recipient],
      });

      writeContract({
        abi: SWAP_ROUTER_ABI,
        address: SWAP_ROUTER_ADDRESS,
        functionName: "multicall",
        args: [params.deadline, [swapData, unwrapData]],
      });
    } else if (isSellingETH) {
      // ETH → Token: exactInputSingle with value
      const fee = getFeeTier("ETH", params.buySymbol);

      if (multiHop) {
        // ETH → WETH → intermediate → Token (shouldn't happen for ETH sells, but safety)
        const path = encodePacked(
          ["address", "uint24", "address", "uint24", "address"],
          [WETH_ADDRESS, 500, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`, 3000, tokenOut],
        );
        const swapData = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: "exactInput",
          args: [{
            path,
            recipient: params.recipient,
            amountIn: params.amountIn,
            amountOutMinimum: params.amountOutMinimum,
          }],
        });
        const refundData = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: "refundETH",
          args: [],
        });
        writeContract({
          abi: SWAP_ROUTER_ABI,
          address: SWAP_ROUTER_ADDRESS,
          functionName: "multicall",
          args: [params.deadline, [swapData, refundData]],
          value: params.amountIn,
        });
      } else {
        writeContract({
          abi: SWAP_ROUTER_ABI,
          address: SWAP_ROUTER_ADDRESS,
          functionName: "exactInputSingle",
          args: [{
            tokenIn: WETH_ADDRESS,
            tokenOut,
            fee,
            recipient: params.recipient,
            amountIn: params.amountIn,
            amountOutMinimum: params.amountOutMinimum,
            sqrtPriceLimitX96: 0n,
          }],
          value: params.amountIn,
        });
      }
    } else if (multiHop) {
      // Token → WETH → Token (e.g., USDC → WBTC)
      const fee1 = getFeeTier(params.sellSymbol, "ETH");
      const fee2 = getFeeTier("ETH", params.buySymbol);
      const path = encodePacked(
        ["address", "uint24", "address", "uint24", "address"],
        [tokenIn, fee1, WETH_ADDRESS, fee2, tokenOut],
      );

      writeContract({
        abi: SWAP_ROUTER_ABI,
        address: SWAP_ROUTER_ADDRESS,
        functionName: "exactInput",
        args: [{
          path,
          recipient: params.recipient,
          amountIn: params.amountIn,
          amountOutMinimum: params.amountOutMinimum,
        }],
      });
    } else {
      // Token → Token (direct pool, e.g., USDC → USDT)
      const fee = getFeeTier(params.sellSymbol, params.buySymbol);

      writeContract({
        abi: SWAP_ROUTER_ABI,
        address: SWAP_ROUTER_ADDRESS,
        functionName: "exactInputSingle",
        args: [{
          tokenIn,
          tokenOut,
          fee,
          recipient: params.recipient,
          amountIn: params.amountIn,
          amountOutMinimum: params.amountOutMinimum,
          sqrtPriceLimitX96: 0n,
        }],
      });
    }
  };

  return {
    swap,
    txHash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

/**
 * Hook to approve ERC-20 token spending by Uniswap SwapRouter02.
 * Returns whether approval is needed and a function to approve.
 */
export function useRouterApproval() {
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const approve = (tokenAddress: `0x${string}`, amount: bigint) => {
    writeContract({
      abi: ERC20_ABI,
      address: tokenAddress,
      functionName: "approve",
      args: [SWAP_ROUTER_ADDRESS, amount],
    });
  };

  return {
    approve,
    txHash,
    isApproving: isPending || isConfirming,
    isApproved: isSuccess,
  };
}
