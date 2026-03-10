# ARI — Intent-Based DEX Implementation Plan

## Overview

ARI is a world-class intent-based DEX that solves three structural problems in DeFi:
1. MEV extraction ($10B+/year) via encrypted mempool + batch auction
2. Liquidity fragmentation via cross-chain intent abstraction (EVM + Solana)
3. Poor UX via gasless, chain-abstracted trading with < 500ms latency

Architecture: 5-layer stack (Frontend -> Intent Gateway -> Solver Network -> Matching Engine -> Settlement),
implemented as a Rust workspace (7 crates) + TypeScript frontend + Solidity contracts.

Target: ~89,000 LOC | Rust 70% : Solidity 6% : TypeScript 24%

---

## Project Structure

```
dex/
├── Cargo.toml                    # Workspace root
├── crates/
│   ├── ari-core/                 # Core types & domain primitives
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── intent.rs         # Intent struct, IntentId, IntentStatus
│   │       ├── solution.rs       # Solution struct, Route, Fill
│   │       ├── token.rs          # Token, TokenPair, TokenList
│   │       ├── chain.rs          # ChainId, ChainConfig, Address abstraction
│   │       ├── pool.rs           # Pool, Tick, TickRange, Position
│   │       ├── order.rs          # LimitOrder, MarketOrder (for OrderBook side)
│   │       ├── batch.rs          # Batch, BatchId, BatchResult
│   │       ├── signature.rs      # EIP-712, Solana Ed25519 sig verification
│   │       └── error.rs          # AriError enum (unified error type)
│   │
│   ├── ari-engine/               # Matching engine: CLMM + OrderBook hybrid
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── clmm/
│   │       │   ├── mod.rs
│   │       │   ├── pool.rs       # Concentrated liquidity pool (Uni V3 math)
│   │       │   ├── tick.rs       # Tick bitmap, tick spacing
│   │       │   ├── math.rs       # sqrtPriceX96, liquidity math, swap math
│   │       │   └── position.rs   # LP position management
│   │       ├── orderbook/
│   │       │   ├── mod.rs
│   │       │   ├── book.rs       # Price-time priority order book
│   │       │   ├── matching.rs   # Continuous matching logic
│   │       │   └── depth.rs      # Depth aggregation, L2/L3 data
│   │       ├── batch/
│   │       │   ├── mod.rs
│   │       │   ├── auction.rs    # 250ms batch auction: collect -> decrypt -> UCP
│   │       │   ├── pricing.rs    # Uniform Clearing Price calculation
│   │       │   └── scheduler.rs  # Batch timing, epoch management
│   │       ├── hybrid.rs         # Router: decide CLMM vs OrderBook vs split
│   │       └── state.rs          # Engine state, pool registry
│   │
│   ├── ari-gateway/              # HTTP/WS API server
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── main.rs           # (only if run standalone; otherwise ari-node uses lib)
│   │       ├── routes/
│   │       │   ├── mod.rs
│   │       │   ├── intents.rs    # POST /v1/intents, GET /v1/intents/{id}
│   │       │   ├── quote.rs      # GET /v1/quote
│   │       │   ├── pools.rs      # GET /v1/pools, /v1/pools/{id}/ticks
│   │       │   ├── tokens.rs     # GET /v1/tokens, /v1/tokens/{addr}/price
│   │       │   ├── liquidity.rs  # POST /v1/liquidity/add, /v1/liquidity/remove
│   │       │   ├── history.rs    # GET /v1/history/{address}
│   │       │   └── health.rs     # GET /health, /v1/status
│   │       ├── ws/
│   │       │   ├── mod.rs
│   │       │   ├── handler.rs    # WebSocket upgrade, message dispatch
│   │       │   ├── channels.rs   # ticker, orderbook, trades, intent channels
│   │       │   └── broadcast.rs  # Fan-out to subscribers
│   │       ├── middleware/
│   │       │   ├── mod.rs
│   │       │   ├── auth.rs       # API key validation, solver auth
│   │       │   ├── rate_limit.rs # Token bucket: Free/Pro/Solver tiers
│   │       │   └── cors.rs       # CORS configuration
│   │       └── state.rs          # AppState: shared references to engine, solvers
│   │
│   ├── ari-solver/               # Reference solver implementation
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── solver.rs         # Solver trait, SolverManager
│   │       ├── router.rs         # Multi-hop routing optimizer (Dijkstra/Bellman-Ford)
│   │       ├── quoter.rs         # Price quotation from multiple sources
│   │       ├── executor.rs       # Solution submission & on-chain execution
│   │       ├── scoring.rs        # Solution scoring: price improvement, gas cost
│   │       └── competition.rs    # Dutch auction among solvers, deadline enforcement
│   │
│   ├── ari-crypto/               # Threshold encryption & BLS for encrypted mempool
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── threshold.rs      # t-of-n threshold encryption (DKG + encrypt/decrypt)
│   │       ├── bls.rs            # BLS signature aggregation
│   │       ├── tlock.rs          # Timelock encryption (encrypt for future round)
│   │       ├── committee.rs      # Committee management, key shares
│   │       └── hash.rs           # Domain-separated hashing utilities
│   │
│   ├── ari-indexer/              # On-chain event indexer
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── evm.rs            # EVM log subscription (ethers/alloy provider)
│   │       ├── solana.rs         # Solana account subscription (solana-client)
│   │       ├── price_feed.rs     # Aggregate price feeds, TWAP/VWAP
│   │       ├── pool_sync.rs      # Sync on-chain pool state to local
│   │       └── store.rs          # Local storage (SQLite/in-memory) for indexed data
│   │
│   └── ari-node/                 # Binary that ties everything together
│       ├── Cargo.toml
│       └── src/
│           ├── main.rs           # CLI entry point (clap)
│           ├── config.rs         # Config file parsing (TOML), env overrides
│           ├── node.rs           # Node orchestrator: start engine, gateway, indexer
│           └── telemetry.rs      # Tracing, metrics (Prometheus), logging
│
├── contracts/                    # Solidity smart contracts (Foundry)
│   ├── foundry.toml
│   ├── src/
│   │   ├── Settlement.sol        # Atomic swap execution, Permit2 integration
│   │   ├── Vault.sol             # Concentrated liquidity pool, ERC-721 LP tokens
│   │   ├── VaultFactory.sol      # Clone factory for Vault deployment
│   │   ├── Governance.sol        # veToken governance
│   │   └── BridgeReceiver.sol    # Cross-chain message receiver
│   ├── test/
│   │   ├── Settlement.t.sol
│   │   ├── Vault.t.sol
│   │   └── Governance.t.sol
│   └── script/
│       └── Deploy.s.sol
│
├── frontend/                     # React + Vite + TypeScript
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── SwapPanel.tsx      # Main swap interface
│       │   ├── TokenSelector.tsx  # Token search & selection modal
│       │   ├── PriceChart.tsx     # TradingView-style chart
│       │   ├── OrderBook.tsx      # Live order book display
│       │   ├── WalletButton.tsx   # Connect wallet (wagmi)
│       │   ├── TxStatus.tsx       # Intent/transaction progress tracker
│       │   └── PoolManager.tsx    # LP position management
│       ├── hooks/
│       │   ├── useSwap.ts         # Submit intent, track status
│       │   ├── useQuote.ts        # Fetch quote with debounce
│       │   ├── useWebSocket.ts    # WS connection to gateway
│       │   ├── useTokens.ts       # Token list, balances
│       │   └── useWallet.ts       # Wallet connection (wagmi wrapper)
│       ├── lib/
│       │   ├── api.ts             # REST API client
│       │   ├── ws.ts              # WebSocket client
│       │   ├── intent.ts          # Intent construction, EIP-712 signing
│       │   └── constants.ts       # Chain configs, contract addresses
│       ├── stores/
│       │   └── swapStore.ts       # Zustand store for swap state
│       └── types/
│           └── index.ts           # TypeScript type definitions
│
├── tasks/
│   ├── todo.md                    # This file
│   └── lessons.md                 # Learnings & pitfalls
│
├── Cargo.toml                     # Workspace manifest
├── Dockerfile                     # (existing — spec site)
├── fly.toml                       # (existing — spec site)
├── index.html                     # (existing — spec site)
└── README.md
```

---

## Investigation Notes

- **Existing state**: The repo currently contains only a static HTML spec page (`index.html`) served via nginx on Fly.io (`dex-spec` app). No Rust or TS code exists yet.
- **Workspace pattern**: Follow EnablerDAO standard: axum 0.7, Tokio runtime, SQLite for local state.
- **Key dependencies (Rust)**: `axum 0.7`, `tokio`, `alloy` (EVM), `solana-sdk`, `serde`, `clap`, `tracing`, `rusqlite`, `blst` (BLS), `threshold-crypto` or custom DKG.
- **Key dependencies (Frontend)**: `react 18`, `vite`, `wagmi v2`, `viem`, `@tanstack/react-query`, `zustand`, `tailwindcss`.
- **Key dependencies (Contracts)**: Foundry, OpenZeppelin, Permit2 (Uniswap).
- **ERC-7683 compliance**: Intent struct must implement `CrossChainOrder` and `ResolvedCrossChainOrder` interfaces.

---

## Phase 1: Core Types & Matching Engine (Weeks 1-4)

### Goal
Establish the Rust workspace and build the domain model + matching engine. Everything downstream depends on these types.

### Steps

- [ ] **Step 1.1**: Initialize Rust workspace (Size: Small)
  - Create root `Cargo.toml` with `[workspace]` members
  - Create all 7 crate directories with `cargo init --lib` (except `ari-node` which is `--bin`)
  - Set Rust edition 2024, resolver = "2"
  - Add shared dependencies in `[workspace.dependencies]`
  - Verify `cargo check` passes on empty workspace
  - Files: `/Users/yuki/workspace/dex/Cargo.toml`, all `crates/*/Cargo.toml`

- [ ] **Step 1.2**: Implement `ari-core` types (Size: Medium)
  - `chain.rs`: `ChainId` enum (Ethereum, Arbitrum, Base, Optimism, Solana), `Address` (20-byte EVM / 32-byte Solana)
  - `token.rs`: `Token { chain, address, decimals, symbol }`, `TokenPair`, derive Serialize/Deserialize
  - `intent.rs`: `Intent` struct matching the spec schema (sender, sell_token, sell_amount, buy_token, min_buy, deadline, src_chain, dst_chain, partial_fill, nonce, signature), `IntentId` (keccak256 hash), `IntentStatus` enum
  - `solution.rs`: `Solution { solver, intents, routes, fills, gas_estimate, score }`, `Route` (multi-hop path), `Fill` (partial fill record)
  - `batch.rs`: `Batch { id, epoch, intents, created_at, sealed_at }`, `BatchResult`
  - `pool.rs`: `Pool`, `Tick`, `TickRange`, `Position` (for CLMM)
  - `order.rs`: `LimitOrder`, `MarketOrder`, `OrderSide` (for OrderBook)
  - `signature.rs`: EIP-712 domain separator, typed data hash, `verify_eip712()`, Solana Ed25519 verify
  - `error.rs`: `AriError` thiserror enum
  - Tests: unit tests for each type's serialization roundtrip, intent ID derivation
  - Dependencies: `alloy-primitives`, `serde`, `thiserror`, `sha3`

- [ ] **Step 1.3**: Implement CLMM pool math in `ari-engine` (Size: Large)
  - `clmm/math.rs`: `sqrt_price_x96` conversion, `get_amount_0_delta`, `get_amount_1_delta`, `compute_swap_step` — port Uniswap V3 math
  - `clmm/tick.rs`: Tick bitmap (256-bit words), `next_initialized_tick`, tick spacing
  - `clmm/pool.rs`: `CLMMPool` struct with `swap()`, `mint()`, `burn()` methods
  - `clmm/position.rs`: Position NFT tracking, fee accumulation
  - Tests: invariant tests (x * y = k within tick range), known swap results, boundary conditions at tick transitions
  - Dependencies: `ruint` (U256), `num-traits`

- [ ] **Step 1.4**: Implement OrderBook in `ari-engine` (Size: Medium)
  - `orderbook/book.rs`: `OrderBook` with `BTreeMap<Price, VecDeque<Order>>` for bids/asks
  - `orderbook/matching.rs`: Price-time priority matching, partial fills
  - `orderbook/depth.rs`: L2 aggregation (price levels + quantities)
  - Tests: matching scenarios (exact match, partial, no match, cross spread)

- [ ] **Step 1.5**: Implement batch auction in `ari-engine` (Size: Large)
  - `batch/scheduler.rs`: 250ms epoch timer, batch lifecycle (Open -> Sealed -> Decrypting -> Matching -> Settled)
  - `batch/auction.rs`: Collect encrypted intents, trigger decryption, call matching
  - `batch/pricing.rs`: Uniform Clearing Price (UCP) algorithm — find the price that maximizes matched volume at a single price
  - `hybrid.rs`: Router that decides whether to use CLMM, OrderBook, or split across both
  - `state.rs`: `EngineState` — pool registry, active batches, historical results
  - Tests: batch with multiple intents, UCP calculation, hybrid routing decisions

### Dependencies
- None (this is the foundation)

### Completion Criteria
- `cargo test -p ari-core -p ari-engine` — all pass
- CLMM swap math matches Uniswap V3 reference implementation for known test vectors
- Batch auction correctly calculates UCP for sample intent sets
- `cargo clippy --workspace` — no warnings

---

## Phase 2: API Gateway & Basic Swap Flow (Weeks 5-8)

### Goal
Stand up the HTTP/WS server so a client can submit an intent and get a quote. Wire together core -> engine -> gateway.

### Steps

- [ ] **Step 2.1**: Implement `ari-gateway` REST routes (Size: Medium)
  - Set up axum 0.7 Router with shared `AppState` (holds `Arc<EngineState>`, config)
  - `routes/intents.rs`: `POST /v1/intents` (validate, assign ID, enqueue to batch), `GET /v1/intents/{id}` (status lookup)
  - `routes/quote.rs`: `GET /v1/quote?sell_token=&buy_token=&sell_amount=` — simulate swap through engine, return expected output
  - `routes/pools.rs`: `GET /v1/pools`, `GET /v1/pools/{id}/ticks`
  - `routes/tokens.rs`: `GET /v1/tokens`, `GET /v1/tokens/{addr}/price`
  - `routes/liquidity.rs`: `POST /v1/liquidity/add`, `POST /v1/liquidity/remove`
  - `routes/history.rs`: `GET /v1/history/{address}`
  - `routes/health.rs`: `GET /health`
  - Request/response types: serde JSON, proper HTTP status codes, error body format
  - Dependencies: `axum 0.7`, `tokio`, `serde_json`, `tower-http` (cors, trace)

- [ ] **Step 2.2**: Implement WebSocket handler (Size: Medium)
  - `ws/handler.rs`: Upgrade to WS, parse subscribe/unsubscribe messages
  - `ws/channels.rs`: `ticker:{pair}`, `orderbook:{pair}`, `trades:{pair}`, `intent:{id}` channels
  - `ws/broadcast.rs`: `tokio::broadcast` channels for fan-out to all subscribers of a topic
  - Wire engine events (new trade, price update, intent status change) into broadcast
  - Tests: WS connection test, subscribe/receive flow

- [ ] **Step 2.3**: Implement middleware (Size: Small)
  - `middleware/rate_limit.rs`: Token bucket per API key, 3 tiers (60/600/6000 req/min)
  - `middleware/auth.rs`: API key from `X-API-Key` header, solver JWT auth
  - `middleware/cors.rs`: Permissive for dev, strict for prod

- [ ] **Step 2.4**: Wire end-to-end basic swap flow (Size: Medium)
  - Client submits intent via POST -> gateway validates -> assigns to current batch -> batch seals at 250ms -> engine matches -> result returned via WS + REST poll
  - No encryption yet (Phase 3), no on-chain settlement yet (Phase 5)
  - In-memory state only (no persistence)
  - Integration test: submit 2 crossing intents (sell ETH/buy USDC + sell USDC/buy ETH), verify match

- [ ] **Step 2.5**: Implement `ari-node` binary (Size: Small)
  - `main.rs`: clap CLI with `run` subcommand
  - `config.rs`: Parse `config.toml` (bind address, batch interval, log level)
  - `node.rs`: Start gateway server, start batch scheduler, graceful shutdown
  - `telemetry.rs`: `tracing-subscriber` with JSON or pretty format
  - Verify: `cargo run -p ari-node -- run` starts server, responds to health check

### Dependencies
- Phase 1 (ari-core types, ari-engine matching)

### Completion Criteria
- `curl localhost:3000/health` returns 200
- `curl -X POST localhost:3000/v1/intents -d '{...}'` accepts intent, returns intent ID
- `GET /v1/quote` returns simulated swap output
- Integration test: 2 intents matched in a batch, results visible via REST
- `cargo test --workspace` — all pass

---

## Phase 3: Solver Network & MEV Protection (Weeks 9-14)

### Goal
Add the encrypted mempool (threshold encryption), solver competition (Dutch auction), and MEV rebate mechanism.

### Steps

- [ ] **Step 3.1**: Implement threshold encryption in `ari-crypto` (Size: Large)
  - `threshold.rs`: Distributed Key Generation (DKG) protocol — key share generation, public key derivation
  - `tlock.rs`: Timelock encryption — encrypt intent bytes against committee public key for future round number
  - `bls.rs`: BLS12-381 signature aggregation (for committee consensus on decryption)
  - `committee.rs`: Committee of N nodes, threshold t, manage key shares, rotation
  - `hash.rs`: Domain-separated hashing (intent hash, batch hash)
  - Tests: encrypt -> DKG shares -> threshold decrypt roundtrip, BLS sig verify
  - Dependencies: `blst`, `ark-bls12-381` or `threshold-crypto`
  - **Risk**: This is the most cryptographically complex module. Consider starting with a simplified version (single-key encrypt/decrypt) and iterating to full threshold scheme.

- [ ] **Step 3.2**: Integrate encryption into intent flow (Size: Medium)
  - Modify gateway: intents are encrypted on submission using committee public key
  - Modify batch scheduler: on batch seal, trigger threshold decryption (collect t shares from committee nodes)
  - After decryption, pass plaintext intents to matching engine
  - Fallback: if decryption fails (committee unavailable), batch is delayed (not dropped)
  - Tests: encrypted intent -> batch seal -> decrypt -> match -> result

- [ ] **Step 3.3**: Implement solver framework in `ari-solver` (Size: Large)
  - `solver.rs`: `Solver` trait (async: given a set of decrypted intents, produce a `Solution`), `SolverManager` (register/deregister solvers)
  - `router.rs`: Multi-hop routing optimizer — build graph of pools, find optimal path via modified Dijkstra (accounting for price impact and gas)
  - `quoter.rs`: Aggregate quotes from CLMM pools, order book, external price feeds
  - `scoring.rs`: Score solutions by: user price improvement vs. quote, gas cost, fill ratio
  - `competition.rs`: Dutch auction among solvers — solvers submit solutions within window, best score wins, winner executes
  - `executor.rs`: Winner submits solution to engine for settlement
  - Tests: solver routing (2-hop, 3-hop), scoring comparison, competition with multiple solvers

- [ ] **Step 3.4**: MEV rebate mechanism (Size: Small)
  - After batch settlement, calculate residual MEV (difference between UCP and individual intent prices)
  - Distribute 80% to users (pro-rata to their trade size), 20% to protocol treasury
  - Track rebates in batch result, expose via API

- [ ] **Step 3.5**: ERC-7683 compliance (Size: Medium)
  - Ensure Intent struct maps to `CrossChainOrder` interface fields
  - Implement `GaslessCrossChainOrder` variant (with permit signature)
  - Add `ResolvedCrossChainOrder` output type
  - Ensure solver solutions produce valid `FillInstruction` arrays
  - Tests: serialize ARI Intent -> valid ERC-7683 CrossChainOrder

### Dependencies
- Phase 1 (core types)
- Phase 2 (gateway, batch scheduler)

### Completion Criteria
- Encrypted mempool: intents encrypted at rest, only decrypted at batch seal
- Solver competition: 2+ solvers compete, best solution wins
- MEV rebate: users receive 80% of residual MEV
- `cargo test --workspace` — all pass
- Benchmark: batch cycle (encrypt -> decrypt -> match -> settle) completes in < 500ms

---

## Phase 4: Frontend & E2E Integration (Weeks 15-20)

### Goal
Build the React frontend with wallet connection, swap UI, and live WebSocket data. Achieve full E2E flow from user click to intent settlement.

### Steps

- [ ] **Step 4.1**: Scaffold frontend project (Size: Small)
  - `npm create vite@latest frontend -- --template react-ts`
  - Install: `wagmi`, `viem`, `@tanstack/react-query`, `zustand`, `tailwindcss`, `@radix-ui/react-*` (for modals/dropdowns)
  - Configure Tailwind, path aliases, ESLint, Prettier
  - Basic `App.tsx` with routing (react-router-dom)

- [ ] **Step 4.2**: Wallet connection (Size: Small)
  - `hooks/useWallet.ts`: wagmi config with connectors (MetaMask, WalletConnect, Coinbase Wallet)
  - `components/WalletButton.tsx`: Connect/disconnect, show address + balance
  - Support EVM chains: Ethereum, Arbitrum, Base
  - Chain switching UI

- [ ] **Step 4.3**: Swap panel core (Size: Large)
  - `components/SwapPanel.tsx`: Sell token input, buy token output, swap direction toggle, slippage settings
  - `components/TokenSelector.tsx`: Modal with search, token list from API, recent tokens, balances
  - `hooks/useQuote.ts`: Debounced quote fetching from `GET /v1/quote`, display expected output + price impact
  - `hooks/useSwap.ts`: Construct Intent, EIP-712 sign with wallet, POST to `/v1/intents`, track status
  - `stores/swapStore.ts`: Zustand store for sell/buy token, amounts, quote, status
  - `lib/intent.ts`: EIP-712 typed data construction for Intent struct
  - `lib/api.ts`: Typed API client (fetch wrapper)

- [ ] **Step 4.4**: Real-time data via WebSocket (Size: Medium)
  - `lib/ws.ts`: WebSocket client with auto-reconnect, heartbeat
  - `hooks/useWebSocket.ts`: Subscribe to channels, dispatch to stores
  - `components/PriceChart.tsx`: TradingView Lightweight Charts integration, real-time candles from WS
  - `components/OrderBook.tsx`: Live bid/ask depth from WS `orderbook:{pair}` channel
  - `components/TxStatus.tsx`: Real-time intent progress (Submitted -> Encrypted -> In Batch -> Matched -> Settled)

- [ ] **Step 4.5**: LP management UI (Size: Medium)
  - `components/PoolManager.tsx`: View pools, add/remove concentrated liquidity
  - Position visualization (tick range on price chart)
  - Fee earnings display, position P&L

- [ ] **Step 4.6**: E2E integration testing (Size: Medium)
  - Start `ari-node` backend, start frontend dev server
  - Playwright test: connect wallet (mock) -> select tokens -> get quote -> swap -> verify settlement
  - Verify WS updates arrive in real-time
  - Test error cases: insufficient balance, expired deadline, slippage exceeded

### Dependencies
- Phase 2 (gateway API must be running)
- Phase 3 (encrypted flow, solver — can be partially mocked)

### Completion Criteria
- User can connect wallet, select tokens, see quote, and execute swap
- Intent status updates in real-time via WebSocket
- Price chart and order book update live
- LP can add/remove concentrated liquidity
- Playwright E2E test passes

---

## Phase 5: Smart Contracts & Testnet (Weeks 21-28)

### Goal
Build the Solidity settlement layer, deploy to testnet (Sepolia + Arbitrum Sepolia), and connect the full stack for on-chain settlement.

### Steps

- [ ] **Step 5.1**: Set up Foundry project (Size: Small)
  - `forge init contracts`
  - Install OpenZeppelin contracts, Permit2
  - Configure `foundry.toml`: solc 0.8.24, optimizer 200 runs, via-ir
  - Set up remappings

- [ ] **Step 5.2**: Implement Settlement.sol (Size: Large)
  - Singleton UUPS proxy pattern
  - `settle(Intent[] intents, Solution solution, bytes proof)`: verify proof, execute atomic swaps via Permit2 `transferFrom`
  - `settleWithPermit()`: gasless flow with Permit2 signatures
  - Reentrancy guard, CEI pattern
  - Pause/unpause (Guardian multisig)
  - Events: `IntentSettled`, `BatchSettled`
  - Tests: single swap, batch of 10, revert on bad proof, revert on expired deadline, reentrancy test

- [ ] **Step 5.3**: Implement Vault.sol + VaultFactory.sol (Size: Large)
  - `Vault.sol`: Concentrated liquidity pool (Uniswap V3 compatible)
    - `mint(tickLower, tickUpper, amount)` -> ERC-721 position NFT
    - `burn(tokenId)` -> return tokens + fees
    - `swap(zeroForOne, amountSpecified, sqrtPriceLimitX96)` -> execute swap within pool
    - Fee tiers: 0.01%, 0.05%, 0.30%, 1.00%
  - `VaultFactory.sol`: `createVault(tokenA, tokenB, fee)` -> CREATE2 clone
  - Tests: mint position, swap, collect fees, multi-position, boundary ticks

- [ ] **Step 5.4**: Implement Governance.sol (Size: Medium)
  - veToken locking: lock $ARI for 1-4 years, voting power = amount * time_remaining / max_lock
  - Proposal creation, voting, execution with Timelock (7 days)
  - Fee distribution to veToken holders
  - Emergency pause (Guardian 5/9 multisig)
  - Tests: lock, vote, execute proposal, emergency pause

- [ ] **Step 5.5**: Implement BridgeReceiver.sol (Size: Medium)
  - Receive cross-chain messages (abstract interface for LayerZero/Hyperlane/Wormhole)
  - Verify message authenticity, execute cross-chain intent settlement
  - Delayed withdrawal for large amounts (circuit breaker)
  - Tests: mock bridge message, verify execution, test delay mechanism

- [ ] **Step 5.6**: Deploy to testnet (Size: Medium)
  - Write `Deploy.s.sol` deployment script
  - Deploy to Sepolia, Arbitrum Sepolia
  - Verify contracts on Etherscan
  - Update frontend `constants.ts` with testnet addresses
  - Wire `ari-solver` executor to submit solutions on-chain
  - Wire `ari-indexer` to watch on-chain events from deployed contracts

- [ ] **Step 5.7**: Implement `ari-indexer` on-chain sync (Size: Medium)
  - `evm.rs`: Subscribe to Settlement/Vault events via `alloy` provider
  - `solana.rs`: (Stub for Phase 6) Account subscription skeleton
  - `pool_sync.rs`: Sync on-chain Vault pool state (current tick, liquidity, positions)
  - `price_feed.rs`: Aggregate price from pools + external oracles (Chainlink, Pyth)
  - `store.rs`: SQLite storage for indexed events, price history
  - Tests: mock EVM events, verify indexing

- [ ] **Step 5.8**: Full-stack testnet E2E (Size: Large)
  - User connects wallet (Sepolia) -> swap on frontend -> intent signed -> gateway -> batch -> solver -> on-chain settlement -> tokens arrive
  - Verify: event indexed -> WS notification -> frontend updates
  - Load test: 100 intents in single batch, verify all settle correctly
  - Document testnet deployment addresses and procedure

### Dependencies
- Phase 1-4 (full Rust backend + frontend)

### Completion Criteria
- All contracts pass Foundry tests (`forge test`)
- Contracts deployed to Sepolia + Arbitrum Sepolia, verified
- Full E2E: frontend swap -> on-chain settlement works on testnet
- Indexer syncs on-chain state back to backend
- Gas benchmarks documented for settlement operations

---

## Phase 6: Cross-Chain & Solana (Future — Weeks 29+)

> Out of scope for initial build, but design decisions in Phase 1-5 must not block this.

- [ ] Solana program (Anchor): Settlement + Vault equivalent
- [ ] `ari-indexer/solana.rs`: Full Solana account subscription
- [ ] Cross-chain intent flow: source chain lock -> bridge message -> destination chain release
- [ ] Multi-bridge verification (2-of-3: LayerZero, Hyperlane, Wormhole)
- [ ] Frontend: Solana wallet adapter (Phantom, Solflare) alongside EVM wallets

---

## Test Strategy

| Layer | Tool | What |
|-------|------|------|
| Unit (Rust) | `cargo test` | Every module, especially math (CLMM, UCP), crypto (threshold encrypt/decrypt) |
| Unit (Solidity) | `forge test` | Every contract function, invariant tests, fuzz tests |
| Unit (TypeScript) | `vitest` | Hooks, API client, intent construction |
| Integration (Rust) | `cargo test --test integration` | Full batch cycle: submit -> encrypt -> match -> settle |
| E2E | Playwright | Frontend -> backend -> (mock) settlement |
| E2E Testnet | Manual + script | Full stack with real testnet contracts |
| Performance | `criterion` (Rust) | Matching engine throughput, batch latency |
| Fuzz | `forge test --fuzz`, `cargo-fuzz` | Contract edge cases, engine overflow/underflow |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Threshold crypto complexity | High | Start with single-key encryption (Phase 3.1), iterate to full DKG |
| CLMM math precision | High | Port exact Uniswap V3 math, verify against known test vectors |
| Batch latency > 500ms | Medium | Profile early, optimize hot paths, consider 500ms batches as fallback |
| Solver game theory | Medium | Start with reference solver only, add competition gradually |
| Cross-chain bridge security | Critical | Defer to Phase 6, use battle-tested bridges only |
| Smart contract vulnerability | Critical | Multiple audits, formal verification, conservative upgrade timelocks |

---

## Key Design Decisions

1. **Rust workspace, not monorepo with separate builds**: All Rust crates share dependencies via workspace, single `cargo build`.
2. **axum 0.7 (not actix/warp)**: Consistent with existing EnablerDAO projects, tower middleware ecosystem.
3. **alloy (not ethers-rs)**: ethers-rs is deprecated, alloy is the successor with better types.
4. **In-memory engine state first, SQLite later**: Keep Phase 1-2 simple, add persistence when needed for indexer.
5. **250ms batch interval**: Balances latency (CEX-like speed) vs. MEV protection (enough time for solver competition). Configurable.
6. **CLMM + OrderBook hybrid**: CLMM for long-tail pairs (passive LPs), OrderBook for major pairs (active MMs). Router decides automatically.
7. **ERC-7683 from day one**: Intent struct designed to be ERC-7683 compatible, avoids costly refactoring later.
8. **Permit2 for token transfers**: No separate approve transactions, better UX, industry standard.

---

## Estimated Timeline

| Phase | Weeks | Milestone |
|-------|-------|-----------|
| Phase 1 | 1-4 | Core types compile, matching engine tested |
| Phase 2 | 5-8 | API server running, basic swap works in-memory |
| Phase 3 | 9-14 | Encrypted mempool, solver competition functional |
| Phase 4 | 15-20 | Frontend complete, E2E swap working |
| Phase 5 | 21-28 | Contracts deployed to testnet, full-stack E2E |
| Phase 6 | 29+ | Cross-chain, Solana, mainnet preparation |

Total estimated: **28 weeks** to testnet-ready (Phases 1-5).
