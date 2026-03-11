import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { SETTLEMENT_ABI } from "../abi/settlement";
import { CONTRACTS } from "../config";
import { encodeAbiParameters, keccak256 } from "viem";

/**
 * Calls Settlement.settle() on-chain.
 *
 * In the intent-based model, a solver calls settle() providing:
 * - The user's signed intent
 * - The solver's solution (how much buyToken to provide)
 *
 * For the MVP, the user can act as a "self-solver" when they have
 * both sides of the trade available.
 */
export function useSettle() {
  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const settle = (params: {
    sender: `0x${string}`;
    sellToken: `0x${string}`;
    sellAmount: bigint;
    buyToken: `0x${string}`;
    minBuyAmount: bigint;
    deadline: bigint;
    nonce: bigint;
    signature: `0x${string}`;
    solver: `0x${string}`;
    buyAmount: bigint;
  }) => {
    // Compute intent hash (matches Settlement.sol _hashIntent)
    const intentHash = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "address" },
          { type: "address" },
          { type: "uint256" },
          { type: "address" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint256" },
        ],
        [
          // INTENT_TYPEHASH - matches the Solidity constant
          keccak256(
            new TextEncoder().encode(
              "Intent(address sender,address sellToken,uint256 sellAmount,address buyToken,uint256 minBuyAmount,uint256 deadline,uint256 nonce)"
            ) as unknown as `0x${string}`
          ),
          params.sender,
          params.sellToken,
          params.sellAmount,
          params.buyToken,
          params.minBuyAmount,
          params.deadline,
          params.nonce,
        ],
      ),
    );

    writeContract({
      abi: SETTLEMENT_ABI,
      address: CONTRACTS.settlement,
      functionName: "settle",
      args: [
        {
          sender: params.sender,
          sellToken: params.sellToken,
          sellAmount: params.sellAmount,
          buyToken: params.buyToken,
          minBuyAmount: params.minBuyAmount,
          deadline: params.deadline,
          nonce: params.nonce,
          signature: params.signature,
        },
        {
          intentHash,
          solver: params.solver,
          buyAmount: params.buyAmount,
          route: "0x" as `0x${string}`,
        },
        "0x" as `0x${string}`, // proof (unused)
      ],
    });
  };

  return {
    settle,
    txHash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  };
}
