# ARI DEX — Arithmetic of Intents

Intent-based decentralized exchange protocol. Users submit trade **intents** (what they want), and a competitive **solver network** finds the optimal execution path.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Frontend    │────▶│  API Gateway  │────▶│  Matching Engine  │
│  React/Vite  │◀────│  axum 0.7    │◀────│  CLMM + Batch    │
└─────────────┘     └──────┬───────┘     └────────┬─────────┘
                           │                      │
                    ┌──────▼───────┐     ┌────────▼─────────┐
                    │   SQLite DB   │     │  Solver Network   │
                    │   (WAL mode)  │     │  Dijkstra Router  │
                    └──────────────┘     └──────────────────┘
                           │
                    ┌──────▼───────┐
                    │  Smart        │
                    │  Contracts    │
                    │  (EVM)        │
                    └──────────────┘
```

## Project Structure

```
crates/
├── ari-core       # Core types and protocol definitions
├── ari-crypto     # Threshold encryption (AES-256-GCM + Shamir SSS)
├── ari-engine     # CLMM math, batch auction, hybrid routing
├── ari-gateway    # REST API + WebSocket server
├── ari-node       # Node binary
└── ari-solver     # Solver: Dijkstra routing, Dutch auction, scoring

contracts/
├── src/
│   ├── Settlement.sol        # Intent settlement with EIP-712 verification
│   ├── Vault.sol             # CLMM + ERC-721 LP NFTs
│   ├── VaultFactory.sol      # EIP-1167 minimal proxy factory
│   ├── SolverRegistry.sol    # 100K $ARI stake, slash mechanism
│   ├── AriToken.sol          # ERC-20 governance token (1B cap)
│   ├── VeARI.sol             # Vote-escrowed, 1–4yr lock, linear decay
│   ├── ConditionalIntent.sol # Limit / Stop Loss / Take Profit / DCA
│   ├── PerpetualMarket.sol   # 20x leverage perpetual futures
│   ├── IntentComposer.sol    # Atomic multi-action intent chaining
│   ├── PrivatePool.sol       # Whitelisted constant-product AMM
│   ├── CrossChainIntent.sol  # ERC-7683 cross-chain intents + escrow
│   ├── AriPaymaster.sol      # ERC-4337 gas sponsorship
│   └── SimplePriceOracle.sol # Price oracle for conditional orders
├── test/                     # Foundry tests (188 passing)
└── script/Deploy.s.sol       # Deployment script

frontend/
├── src/
│   ├── components/
│   │   ├── SwapPanel.tsx     # Main swap interface
│   │   └── Header.tsx        # Wallet connect header
│   ├── hooks/
│   │   ├── useQuote.ts       # Price quote fetching
│   │   ├── useSubmitIntent.ts # Intent submission
│   │   └── useSignIntent.ts  # EIP-712 signing
│   ├── App.tsx               # wagmi + react-query providers
│   └── config.ts             # Chain config, contract addresses
└── package.json
```

## Key Features

### Trading
- **Intent-based swaps** — submit what you want, solvers find the best path
- **Concentrated Liquidity (CLMM)** — Q64.96 fixed-point sqrt price math
- **Batch Auctions** — uniform clearing price, MEV-resistant
- **Limit Orders / Stop Loss / DCA** — conditional intent execution
- **Perpetual Futures** — up to 20x leverage with liquidation engine

### Protocol
- **Solver Network** — competitive Dutch auction for order filling
- **Encrypted Mempool** — AES-256-GCM + Shamir's Secret Sharing
- **Cross-chain Intents** — ERC-7683 aligned with escrow mechanism
- **Account Abstraction** — ERC-4337 paymaster for gasless trading
- **Intent Composability** — atomic multi-action chaining

### Governance
- **$ARI Token** — ERC-20 with 1B supply cap
- **veARI** — vote-escrowed governance (1–4 year lock, linear decay)
- **Solver Staking** — 100K $ARI minimum, slashing for misbehavior

## Quick Start

### Prerequisites
- [Rust](https://rustup.rs/) (1.75+)
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Node.js](https://nodejs.org/) (18+)

### Build & Test

```bash
# Rust
cargo build --workspace
cargo test --workspace

# Smart Contracts
cd contracts
forge test

# Frontend
cd frontend
npm install
npm run build
```

### Run Locally

```bash
# Start API server (port 3000)
cargo run -p ari-node

# Start frontend dev server (port 5173)
cd frontend && npm run dev
```

### Deploy Contracts

```bash
cd contracts
cp .env.example .env
# Set PRIVATE_KEY and DEPLOYER_ADDRESS

forge script script/Deploy.s.sol \
  --rpc-url <RPC_URL> \
  --private-key $PRIVATE_KEY \
  --broadcast --verify
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/intents` | Submit a trade intent |
| GET | `/v1/intents/:id` | Get intent status |
| GET | `/v1/quote` | Get price quote |
| GET | `/v1/pools` | List liquidity pools |
| GET | `/v1/tokens` | List supported tokens |
| GET | `/v1/history/:address` | Trade history |
| POST | `/v1/rfq` | Request for quote |
| GET | `/v1/solvers` | Solver marketplace |
| WS | `/ws` | Real-time prices & intent updates |

## Security

- EIP-712 signature verification on all intents
- SafeERC20 across all token-handling contracts
- Reentrancy guards on Vault operations
- Oracle-based pricing (no user-supplied prices)
- CORS restricted to known origins
- WebSocket connection limits (max 1000)
- Input validation on all API endpoints
- Concurrency limiting (100 concurrent requests)

## Mainnet Contracts (Ethereum)

| Contract | Address |
|----------|---------|
| Settlement | [`0x536EeDA7d07cF7Af171fBeD8FAe7987a5c63B822`](https://etherscan.io/address/0x536EeDA7d07cF7Af171fBeD8FAe7987a5c63B822) |
| VaultFactory | [`0x1d06BEDA9797CB52363302bBf2d768a36b53cd5c`](https://etherscan.io/address/0x1d06BEDA9797CB52363302bBf2d768a36b53cd5c) |
| ARI Token | [`0x3B15dD6d6E5a58b755C70b72fC6e2757F1062d8C`](https://etherscan.io/address/0x3B15dD6d6E5a58b755C70b72fC6e2757F1062d8C) |
| VeARI | [`0x90dA559495bAb9408F8175eB6F489eab48E20d10`](https://etherscan.io/address/0x90dA559495bAb9408F8175eB6F489eab48E20d10) |
| SolverRegistry | [`0x72eCef8A9321f5BdaF26Db3AB983c15DE61F9C4E`](https://etherscan.io/address/0x72eCef8A9321f5BdaF26Db3AB983c15DE61F9C4E) |
| SimplePriceOracle | [`0x0eC4094174F3B8fccc23B829B27A42BA28eCF4c4`](https://etherscan.io/address/0x0eC4094174F3B8fccc23B829B27A42BA28eCF4c4) |
| ConditionalIntent | [`0x747ffBF3c30Ac13cf54cb242e70Dcb532c4cBD05`](https://etherscan.io/address/0x747ffBF3c30Ac13cf54cb242e70Dcb532c4cBD05) |
| PerpetualMarket | [`0x5DE57652E281B94b3f40Eb821DaF3e4924bc1A2d`](https://etherscan.io/address/0x5DE57652E281B94b3f40Eb821DaF3e4924bc1A2d) |
| CrossChainIntent | [`0x64d9F15D3d6349A7B3Cc1b8D6B57bF32d8c12c5A`](https://etherscan.io/address/0x64d9F15D3d6349A7B3Cc1b8D6B57bF32d8c12c5A) |
| IntentComposer | [`0x081887186409851f58e5229D343657ac84F4F283`](https://etherscan.io/address/0x081887186409851f58e5229D343657ac84F4F283) |
| PrivatePool | [`0x429bCCb01e5754132D56fAA75CC08e60A53a0618`](https://etherscan.io/address/0x429bCCb01e5754132D56fAA75CC08e60A53a0618) |
| AriPaymaster | [`0x0c965066f106a94baBCb18db8fC37A5DF4180CAe`](https://etherscan.io/address/0x0c965066f106a94baBCb18db8fC37A5DF4180CAe) |

## Deployment

| Service | URL | Platform |
|---------|-----|----------|
| Spec Site | [dex-spec.fly.dev](https://dex-spec.fly.dev) | Fly.io |
| API Server | [ari-dex-api.fly.dev](https://ari-dex-api.fly.dev) | Fly.io |
| Contracts | Ethereum Mainnet | EVM |

## Supported Chains

- Ethereum Mainnet
- Arbitrum
- Base

## License

MIT

---

Built by [EnablerDAO](https://github.com/enablerdao)
