/** Settlement contract ABI (minimal - only functions we call from frontend) */
export const SETTLEMENT_ABI = [
  {
    type: "function",
    name: "settle",
    inputs: [
      {
        name: "intent",
        type: "tuple",
        components: [
          { name: "sender", type: "address" },
          { name: "sellToken", type: "address" },
          { name: "sellAmount", type: "uint256" },
          { name: "buyToken", type: "address" },
          { name: "minBuyAmount", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "signature", type: "bytes" },
        ],
      },
      {
        name: "solution",
        type: "tuple",
        components: [
          { name: "intentHash", type: "bytes32" },
          { name: "solver", type: "address" },
          { name: "buyAmount", type: "uint256" },
          { name: "route", type: "bytes" },
        ],
      },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "usedNonces",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "IntentSettled",
    inputs: [
      { name: "intentHash", type: "bytes32", indexed: true },
      { name: "solver", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "sellToken", type: "address", indexed: false },
      { name: "sellAmount", type: "uint256", indexed: false },
      { name: "buyToken", type: "address", indexed: false },
      { name: "buyAmount", type: "uint256", indexed: false },
    ],
  },
] as const;
