import { useEffect, useState } from "react";
import { API_URL } from "../config";

interface NetworkStats {
  total_solvers: number;
  total_fills: number;
  settled_intents: number;
}

export function DocsPage() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/v1/metrics`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  }

  return (
    <div className="docs-page">
      {/* Hero */}
      <div className="docs-hero">
        <h1 className="docs-hero-title">Run ARI Infrastructure</h1>
        <p className="docs-hero-sub">
          Join the ARI network as a solver, run your own node, or scale the
          infrastructure. Earn fees by settling user intents on Ethereum.
        </p>
        <div className="docs-hero-stats">
          <div className="docs-hero-stat">
            <span className="docs-hero-stat-value">
              {stats?.total_solvers ?? "-"}
            </span>
            <span className="docs-hero-stat-label">Active Solvers</span>
          </div>
          <div className="docs-hero-stat">
            <span className="docs-hero-stat-value">
              {stats?.total_fills ?? "-"}
            </span>
            <span className="docs-hero-stat-label">Total Fills</span>
          </div>
          <div className="docs-hero-stat">
            <span className="docs-hero-stat-value">
              {stats?.settled_intents ?? "-"}
            </span>
            <span className="docs-hero-stat-label">Intents Settled</span>
          </div>
        </div>
      </div>

      {/* Section: Become a Solver */}
      <section className="docs-section">
        <h2 className="docs-section-title">1. Become a Solver</h2>
        <p className="docs-section-desc">
          Solvers compete to fill user intents at the best price. When you
          settle an intent, you earn the spread as profit. No minimum stake
          required to start.
        </p>

        <h3 className="docs-step-title">Register via API</h3>
        <CodeBlock
          id="register"
          copied={copied}
          onCopy={copy}
          code={`curl -X POST ${API_URL || "https://ari-dex-api.fly.dev"}/v1/solvers/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "address": "0xYOUR_WALLET_ADDRESS",
    "name": "My Solver",
    "endpoint": "https://my-solver.example.com/solve"
  }'`}
        />

        <h3 className="docs-step-title">How Solving Works</h3>
        <ol className="docs-list">
          <li>
            User submits an intent (e.g. &quot;swap 1 ETH for at least 2000
            USDC&quot;)
          </li>
          <li>
            Your solver receives the intent via WebSocket or polling{" "}
            <code>GET /v1/intents?status=pending</code>
          </li>
          <li>
            Compute the best execution route (Uniswap, aggregators, your own
            liquidity)
          </li>
          <li>
            Call <code>Settlement.settle()</code> on-chain to fill the intent
          </li>
          <li>You keep the price improvement as profit (typically 0.01-0.1%)</li>
        </ol>

        <h3 className="docs-step-title">Settlement Contract</h3>
        <CodeBlock
          id="contract"
          copied={copied}
          onCopy={copy}
          code={`// Ethereum Mainnet
Settlement: 0x536EeDA7d07cF7Af171fBeD8FAe7987a5c63B822

// ABI (key functions)
settle(Intent calldata intent, Solution calldata solution, bytes calldata proof)
settleBatch(Intent[] calldata intents, Solution[] calldata solutions, bytes calldata batchProof)`}
        />
      </section>

      {/* Section: Run a Node */}
      <section className="docs-section">
        <h2 className="docs-section-title">2. Run Your Own Node</h2>
        <p className="docs-section-desc">
          Run the full ARI gateway with solver worker to participate in the
          network. Requires Rust and an Ethereum RPC endpoint.
        </p>

        <h3 className="docs-step-title">Quick Start (Docker)</h3>
        <CodeBlock
          id="docker"
          copied={copied}
          onCopy={copy}
          code={`# Clone the repo
git clone https://github.com/yukihamada/ari-dex.git
cd ari-dex

# Build and run
docker build -f Dockerfile.api -t ari-node .
docker run -p 3000:3000 \\
  -e EXECUTOR_ENABLED=true \\
  -e ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY \\
  -e SOLVER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY \\
  -v ari_data:/data \\
  ari-node`}
        />

        <h3 className="docs-step-title">Build from Source</h3>
        <CodeBlock
          id="source"
          copied={copied}
          onCopy={copy}
          code={`# Prerequisites: Rust 1.86+, Node.js 20+
git clone https://github.com/yukihamada/ari-dex.git
cd ari-dex

# Build backend
cargo build --release --bin ari-node

# Build frontend
cd frontend && npm ci && npm run build && cd ..

# Run
RUST_LOG=info ./target/release/ari-node`}
        />

        <h3 className="docs-step-title">Environment Variables</h3>
        <div className="docs-env-table">
          <table className="page-table">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Required</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>DB_PATH</code></td>
                <td>No</td>
                <td>SQLite database path (default: ./ari-dex.db)</td>
              </tr>
              <tr>
                <td><code>ETH_RPC_URL</code></td>
                <td>Yes*</td>
                <td>Ethereum JSON-RPC endpoint (Alchemy, Infura, etc.)</td>
              </tr>
              <tr>
                <td><code>SOLVER_PRIVATE_KEY</code></td>
                <td>Yes*</td>
                <td>Private key of solver wallet (for on-chain settlement)</td>
              </tr>
              <tr>
                <td><code>EXECUTOR_ENABLED</code></td>
                <td>No</td>
                <td>Set to &quot;true&quot; to enable on-chain execution</td>
              </tr>
              <tr>
                <td><code>SUBGRAPH_API_KEY</code></td>
                <td>No</td>
                <td>The Graph API key for live pool data</td>
              </tr>
              <tr>
                <td><code>CHAIN_ID</code></td>
                <td>No</td>
                <td>Chain ID (default: 1 for Ethereum mainnet)</td>
              </tr>
              <tr>
                <td><code>SETTLEMENT_ADDRESS</code></td>
                <td>No</td>
                <td>Settlement contract address (has default)</td>
              </tr>
            </tbody>
          </table>
          <p className="docs-env-note">* Required for on-chain settlement. Without these, the node runs in dry-run mode.</p>
        </div>
      </section>

      {/* Section: Scale Infrastructure */}
      <section className="docs-section">
        <h2 className="docs-section-title">3. Scale the Infrastructure</h2>
        <p className="docs-section-desc">
          Deploy your own ARI gateway on Fly.io, AWS, or any cloud provider.
          Each node is independent and connects to Ethereum directly.
        </p>

        <h3 className="docs-step-title">Deploy to Fly.io</h3>
        <CodeBlock
          id="flyio"
          copied={copied}
          onCopy={copy}
          code={`# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Create app
fly launch --name my-ari-node --region nrt

# Create persistent volume for DB
fly volumes create ari_data --size 1 --region nrt

# Set secrets (never in CLI args!)
echo "SOLVER_PRIVATE_KEY=0x..." | fly secrets import
fly secrets set EXECUTOR_ENABLED=true \\
  ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY

# Deploy
fly deploy -c fly.api.toml`}
        />

        <h3 className="docs-step-title">Deploy to AWS (Lambda)</h3>
        <CodeBlock
          id="aws"
          copied={copied}
          onCopy={copy}
          code={`# Build for Lambda (musl target)
cargo zigbuild --release --target aarch64-unknown-linux-musl \\
  --bin ari-node

# Package and deploy
zip -j lambda.zip target/aarch64-unknown-linux-musl/release/ari-node
aws lambda update-function-code \\
  --function-name ari-node \\
  --zip-file fileb://lambda.zip`}
        />

        <h3 className="docs-step-title">Multi-Region Setup</h3>
        <CodeBlock
          id="multi"
          copied={copied}
          onCopy={copy}
          code={`# Add regions for lower latency
fly scale count 1 --region nrt  # Tokyo
fly scale count 1 --region iad  # Virginia
fly scale count 1 --region ams  # Amsterdam

# Each region needs its own volume
fly volumes create ari_data --size 1 --region iad
fly volumes create ari_data --size 1 --region ams`}
        />
      </section>

      {/* Section: API Reference */}
      <section className="docs-section">
        <h2 className="docs-section-title">4. API Reference</h2>
        <p className="docs-section-desc">
          All endpoints are available at{" "}
          <a
            href="https://ari-dex-api.fly.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="docs-link"
          >
            ari-dex-api.fly.dev
          </a>
        </p>

        <div className="docs-api-table">
          <table className="page-table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Endpoint</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="docs-method docs-method--get">GET</span></td>
                <td><code>/health</code></td>
                <td>Health check with DB/solver status</td>
              </tr>
              <tr>
                <td><span className="docs-method docs-method--get">GET</span></td>
                <td><code>/v1/metrics</code></td>
                <td>Network metrics (intents, fills, solvers)</td>
              </tr>
              <tr>
                <td><span className="docs-method docs-method--post">POST</span></td>
                <td><code>/v1/intents</code></td>
                <td>Submit a swap intent</td>
              </tr>
              <tr>
                <td><span className="docs-method docs-method--get">GET</span></td>
                <td><code>/v1/intents?status=pending</code></td>
                <td>List intents by status</td>
              </tr>
              <tr>
                <td><span className="docs-method docs-method--get">GET</span></td>
                <td><code>/v1/quote?sell_token=ETH&buy_token=USDC&sell_amount=1000000000000000000</code></td>
                <td>Get price quote</td>
              </tr>
              <tr>
                <td><span className="docs-method docs-method--get">GET</span></td>
                <td><code>/v1/pools</code></td>
                <td>Live Uniswap V3 pool data</td>
              </tr>
              <tr>
                <td><span className="docs-method docs-method--get">GET</span></td>
                <td><code>/v1/solvers</code></td>
                <td>List active solvers</td>
              </tr>
              <tr>
                <td><span className="docs-method docs-method--post">POST</span></td>
                <td><code>/v1/solvers/register</code></td>
                <td>Register as a solver</td>
              </tr>
              <tr>
                <td><span className="docs-method docs-method--get">GET</span></td>
                <td><code>/v1/settlement/status</code></td>
                <td>On-chain executor status</td>
              </tr>
              <tr>
                <td><span className="docs-method docs-method--get">GET</span></td>
                <td><code>/ws</code></td>
                <td>WebSocket (real-time intents + prices)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section: WebSocket */}
      <section className="docs-section">
        <h2 className="docs-section-title">5. WebSocket Integration</h2>
        <p className="docs-section-desc">
          Connect to the WebSocket for real-time intent and price updates.
          Recommended for solvers to minimize latency.
        </p>

        <CodeBlock
          id="ws"
          copied={copied}
          onCopy={copy}
          code={`// JavaScript
const ws = new WebSocket("wss://ari-dex-api.fly.dev/ws");

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "intent") {
    // New intent submitted - check if you can fill it
    console.log("New intent:", data.intent_id, data.status);
  }

  if (data.type === "price") {
    // Price ticker update
    console.log("Price:", data.token, data.price);
  }
};`}
        />
      </section>

      {/* Section: Architecture */}
      <section className="docs-section">
        <h2 className="docs-section-title">6. Architecture</h2>
        <div className="docs-arch">
          <pre className="docs-arch-diagram">{`
  User (Frontend)
       |
       | EIP-712 signed intent
       v
  +-----------------+
  |  ARI Gateway    |  REST API + WebSocket
  |  (axum + Rust)  |  Port 3000
  +-----------------+
       |
       | 5s polling
       v
  +-----------------+
  |  Solver Worker  |  Price feeds (CoinGecko + CryptoCompare)
  |  (background)   |  Intent matching + fill calculation
  +-----------------+
       |
       | settle() / settleBatch()
       v
  +-----------------+
  |  Settlement.sol |  0x536E...B822 (Ethereum Mainnet)
  |  (on-chain)     |  ERC-20 transfers + event emission
  +-----------------+
       |
       v
  Uniswap V3 Pools   (liquidity source)
`}</pre>
        </div>
      </section>

      {/* GitHub */}
      <section className="docs-section docs-section--cta">
        <h2 className="docs-section-title">Open Source</h2>
        <p className="docs-section-desc">
          ARI is fully open source. Contributions welcome.
        </p>
        <a
          href="https://github.com/yukihamada/ari-dex"
          target="_blank"
          rel="noopener noreferrer"
          className="docs-cta-btn"
        >
          View on GitHub
        </a>
      </section>
    </div>
  );
}

/* Reusable code block with copy button */
function CodeBlock({
  id,
  code,
  copied,
  onCopy,
}: {
  id: string;
  code: string;
  copied: string;
  onCopy: (text: string, id: string) => void;
}) {
  return (
    <div className="docs-code-block">
      <button
        className="docs-code-copy"
        onClick={() => onCopy(code, id)}
      >
        {copied === id ? "Copied!" : "Copy"}
      </button>
      <pre className="docs-code">{code}</pre>
    </div>
  );
}
