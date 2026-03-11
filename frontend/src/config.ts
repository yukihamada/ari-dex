import { ChainId } from "./types";

/** Base URL for the ARI gateway API. Empty string = same origin (production). */
export const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:3000");

/** Supported chains and their RPC endpoints. */
export const SUPPORTED_CHAINS = [
  {
    chainId: ChainId.Ethereum,
    name: "Ethereum",
    rpcUrl: "https://eth.llamarpc.com",
    blockExplorer: "https://etherscan.io",
  },
  {
    chainId: ChainId.Arbitrum,
    name: "Arbitrum",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    blockExplorer: "https://arbiscan.io",
  },
  {
    chainId: ChainId.Base,
    name: "Base",
    rpcUrl: "https://mainnet.base.org",
    blockExplorer: "https://basescan.org",
  },
] as const;

/**
 * Contract addresses on Ethereum Mainnet.
 * Override via VITE_CONTRACT_SETTLEMENT etc. environment variables.
 */
export const CONTRACTS = {
  settlement: (import.meta.env.VITE_CONTRACT_SETTLEMENT ?? "0x536EeDA7d07cF7Af171fBeD8FAe7987a5c63B822") as `0x${string}`,
  vaultFactory: (import.meta.env.VITE_CONTRACT_VAULT ?? "0x1d06BEDA9797CB52363302bBf2d768a36b53cd5c") as `0x${string}`,
  ariToken: (import.meta.env.VITE_CONTRACT_ARI_TOKEN ?? "0x3B15dD6d6E5a58b755C70b72fC6e2757F1062d8C") as `0x${string}`,
  veARI: (import.meta.env.VITE_CONTRACT_VEARI ?? "0x90dA559495bAb9408F8175eB6F489eab48E20d10") as `0x${string}`,
  solverRegistry: (import.meta.env.VITE_CONTRACT_SOLVER_REG ?? "0x72eCef8A9321f5BdaF26Db3AB983c15DE61F9C4E") as `0x${string}`,
  oracle: (import.meta.env.VITE_CONTRACT_ORACLE ?? "0x0eC4094174F3B8fccc23B829B27A42BA28eCF4c4") as `0x${string}`,
  conditionalIntent: (import.meta.env.VITE_CONTRACT_COND_INTENT ?? "0x747ffBF3c30Ac13cf54cb242e70Dcb532c4cBD05") as `0x${string}`,
  perpetualMarket: (import.meta.env.VITE_CONTRACT_PERP ?? "0x5DE57652E281B94b3f40Eb821DaF3e4924bc1A2d") as `0x${string}`,
  crossChainIntent: (import.meta.env.VITE_CONTRACT_CROSS_CHAIN ?? "0x64d9F15D3d6349A7B3Cc1b8D6B57bF32d8c12c5A") as `0x${string}`,
  intentComposer: (import.meta.env.VITE_CONTRACT_COMPOSER ?? "0x081887186409851f58e5229D343657ac84F4F283") as `0x${string}`,
  privatePool: (import.meta.env.VITE_CONTRACT_PRIVATE_POOL ?? "0x429bCCb01e5754132D56fAA75CC08e60A53a0618") as `0x${string}`,
  paymaster: (import.meta.env.VITE_CONTRACT_PAYMASTER ?? "0x0c965066f106a94baBCb18db8fC37A5DF4180CAe") as `0x${string}`,
} as const;

/** Default slippage tolerance (0.5%). */
export const DEFAULT_SLIPPAGE_BPS = 50;

/** Intent expiry duration in seconds (5 minutes). */
export const INTENT_EXPIRY_SECONDS = 300;
