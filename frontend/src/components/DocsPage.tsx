import { useEffect, useState } from "react";
import { API_URL } from "../config";

interface NetworkStats {
  total_solvers: number;
  total_fills: number;
  settled_intents: number;
}

type Lang = "ja" | "en";

export function DocsPage() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [copied, setCopied] = useState("");
  const [lang, setLang] = useState<Lang>(() => {
    if (navigator.language.startsWith("ja")) return "ja";
    return "en";
  });

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

  const t = lang === "ja" ? ja : en;

  return (
    <div className="docs-page">
      {/* Language Toggle */}
      <div className="docs-lang-toggle">
        <button
          className={`docs-lang-btn ${lang === "ja" ? "docs-lang-btn--active" : ""}`}
          onClick={() => setLang("ja")}
        >
          JP
        </button>
        <button
          className={`docs-lang-btn ${lang === "en" ? "docs-lang-btn--active" : ""}`}
          onClick={() => setLang("en")}
        >
          EN
        </button>
      </div>

      {/* Hero */}
      <div className="docs-hero">
        <h1 className="docs-hero-title">{t.heroTitle}</h1>
        <p className="docs-hero-sub">{t.heroSub}</p>
        <div className="docs-hero-stats">
          <div className="docs-hero-stat">
            <span className="docs-hero-stat-value">
              {stats?.total_solvers ?? "-"}
            </span>
            <span className="docs-hero-stat-label">{t.activeSolvers}</span>
          </div>
          <div className="docs-hero-stat">
            <span className="docs-hero-stat-value">
              {stats?.total_fills ?? "-"}
            </span>
            <span className="docs-hero-stat-label">{t.totalFills}</span>
          </div>
          <div className="docs-hero-stat">
            <span className="docs-hero-stat-value">
              {stats?.settled_intents ?? "-"}
            </span>
            <span className="docs-hero-stat-label">{t.intentsSettled}</span>
          </div>
        </div>
      </div>

      {/* Section 1: Become a Solver */}
      <section className="docs-section">
        <h2 className="docs-section-title">{t.s1Title}</h2>
        <p className="docs-section-desc">{t.s1Desc}</p>

        <h3 className="docs-step-title">{t.s1RegisterTitle}</h3>
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

        <h3 className="docs-step-title">{t.s1HowTitle}</h3>
        <ol className="docs-list">
          {t.s1Steps.map((step, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: step }} />
          ))}
        </ol>

        <h3 className="docs-step-title">{t.s1ContractTitle}</h3>
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

      {/* Section 2: Run a Node */}
      <section className="docs-section">
        <h2 className="docs-section-title">{t.s2Title}</h2>
        <p className="docs-section-desc">{t.s2Desc}</p>

        <h3 className="docs-step-title">{t.s2DockerTitle}</h3>
        <CodeBlock
          id="docker"
          copied={copied}
          onCopy={copy}
          code={`# ${t.s2CloneComment}
git clone https://github.com/yukihamada/ari-dex.git
cd ari-dex

# ${t.s2BuildComment}
docker build -f Dockerfile.api -t ari-node .
docker run -p 3000:3000 \\
  -e EXECUTOR_ENABLED=true \\
  -e ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY \\
  -e SOLVER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY \\
  -v ari_data:/data \\
  ari-node`}
        />

        <h3 className="docs-step-title">{t.s2SourceTitle}</h3>
        <CodeBlock
          id="source"
          copied={copied}
          onCopy={copy}
          code={`# ${t.s2PrereqComment}
git clone https://github.com/yukihamada/ari-dex.git
cd ari-dex

# ${t.s2BackendComment}
cargo build --release --bin ari-node

# ${t.s2FrontendComment}
cd frontend && npm ci && npm run build && cd ..

# ${t.s2RunComment}
RUST_LOG=info ./target/release/ari-node`}
        />

        <h3 className="docs-step-title">{t.s2EnvTitle}</h3>
        <div className="docs-env-table">
          <table className="page-table">
            <thead>
              <tr>
                <th>{t.envVar}</th>
                <th>{t.envRequired}</th>
                <th>{t.envDesc}</th>
              </tr>
            </thead>
            <tbody>
              {t.envRows.map((row, i) => (
                <tr key={i}>
                  <td><code>{row[0]}</code></td>
                  <td>{row[1]}</td>
                  <td>{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="docs-env-note">{t.envNote}</p>
        </div>
      </section>

      {/* Section 3: Scale */}
      <section className="docs-section">
        <h2 className="docs-section-title">{t.s3Title}</h2>
        <p className="docs-section-desc">{t.s3Desc}</p>

        <h3 className="docs-step-title">{t.s3FlyTitle}</h3>
        <CodeBlock
          id="flyio"
          copied={copied}
          onCopy={copy}
          code={`# Fly CLI ${t.s3InstallComment}
curl -L https://fly.io/install.sh | sh

# ${t.s3CreateComment}
fly launch --name my-ari-node --region nrt

# ${t.s3VolumeComment}
fly volumes create ari_data --size 1 --region nrt

# ${t.s3SecretsComment}
echo "SOLVER_PRIVATE_KEY=0x..." | fly secrets import
fly secrets set EXECUTOR_ENABLED=true \\
  ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY

# ${t.s3DeployComment}
fly deploy -c fly.api.toml`}
        />

        <h3 className="docs-step-title">{t.s3MultiTitle}</h3>
        <CodeBlock
          id="multi"
          copied={copied}
          onCopy={copy}
          code={`# ${t.s3MultiComment}
fly scale count 1 --region nrt  # Tokyo
fly scale count 1 --region iad  # Virginia
fly scale count 1 --region ams  # Amsterdam

# ${t.s3VolumeEachComment}
fly volumes create ari_data --size 1 --region iad
fly volumes create ari_data --size 1 --region ams`}
        />
      </section>

      {/* Section 4: API Reference */}
      <section className="docs-section">
        <h2 className="docs-section-title">{t.s4Title}</h2>
        <p className="docs-section-desc">
          {t.s4Desc}{" "}
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
                <th>{t.apiMethod}</th>
                <th>{t.apiEndpoint}</th>
                <th>{t.apiDesc}</th>
              </tr>
            </thead>
            <tbody>
              {t.apiRows.map((row, i) => (
                <tr key={i}>
                  <td>
                    <span className={`docs-method docs-method--${row[0].toLowerCase()}`}>
                      {row[0]}
                    </span>
                  </td>
                  <td><code>{row[1]}</code></td>
                  <td>{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 5: WebSocket */}
      <section className="docs-section">
        <h2 className="docs-section-title">{t.s5Title}</h2>
        <p className="docs-section-desc">{t.s5Desc}</p>

        <CodeBlock
          id="ws"
          copied={copied}
          onCopy={copy}
          code={`const ws = new WebSocket("wss://ari-dex-api.fly.dev/ws");

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "intent") {
    // ${t.s5IntentComment}
    console.log("New intent:", data.intent_id, data.status);
  }

  if (data.type === "price") {
    // ${t.s5PriceComment}
    console.log("Price:", data.token, data.price);
  }
};`}
        />
      </section>

      {/* Section 6: Architecture */}
      <section className="docs-section">
        <h2 className="docs-section-title">{t.s6Title}</h2>
        <div className="docs-arch">
          <pre className="docs-arch-diagram">{`
  ${t.s6User}
       |
       | EIP-712 ${t.s6SignedIntent}
       v
  +-----------------+
  |  ARI Gateway    |  REST API + WebSocket
  |  (axum + Rust)  |  Port 3000
  +-----------------+
       |
       | 5${t.s6Polling}
       v
  +-----------------+
  |  Solver Worker  |  ${t.s6PriceFeeds}
  |  (background)   |  ${t.s6Matching}
  +-----------------+
       |
       | settle() / settleBatch()
       v
  +-----------------+
  |  Settlement.sol |  0x536E...B822 (Ethereum Mainnet)
  |  (on-chain)     |  ERC-20 ${t.s6Transfers}
  +-----------------+
       |
       v
  Uniswap V3 Pools   (${t.s6LiquiditySource})
`}</pre>
        </div>
      </section>

      {/* GitHub */}
      <section className="docs-section docs-section--cta">
        <h2 className="docs-section-title">{t.openSource}</h2>
        <p className="docs-section-desc">{t.openSourceDesc}</p>
        <a
          href="https://github.com/yukihamada/ari-dex"
          target="_blank"
          rel="noopener noreferrer"
          className="docs-cta-btn"
        >
          {t.viewGithub}
        </a>
      </section>
    </div>
  );
}

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
      <button className="docs-code-copy" onClick={() => onCopy(code, id)}>
        {copied === id ? "Copied!" : "Copy"}
      </button>
      <pre className="docs-code">{code}</pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

const ja = {
  heroTitle: "ARI ネットワークに参加する",
  heroSub:
    "ソルバーとしてネットワークに参加し、自分のノードを立てて、インフラをスケールさせましょう。ユーザーの intent を Ethereum 上で決済することで手数料を獲得できます。",
  activeSolvers: "稼働中ソルバー",
  totalFills: "総約定数",
  intentsSettled: "決済済み Intent",

  s1Title: "1. ソルバーになる",
  s1Desc:
    "ソルバーはユーザーの intent を最良価格で約定させるために競争します。intent を決済すると、スプレッド（価格改善分）が利益になります。最低ステーク不要で参加できます。",
  s1RegisterTitle: "API でソルバー登録",
  s1HowTitle: "ソルバーの仕組み",
  s1Steps: [
    'ユーザーが intent を送信（例: 「1 ETH を最低 2000 USDC で交換」）',
    'ソルバーが WebSocket またはポーリング <code>GET /v1/intents?status=pending</code> で intent を受信',
    "最良の実行ルートを計算（Uniswap、アグリゲーター、自前の流動性など）",
    "オンチェーンで <code>Settlement.settle()</code> を呼び出して intent を約定",
    "価格改善分が利益になる（通常 0.01〜0.1%）",
  ],
  s1ContractTitle: "Settlement コントラクト",

  s2Title: "2. ノードを立てる",
  s2Desc:
    "ソルバーワーカー付きの ARI ゲートウェイをフルで稼働させ、ネットワークに参加できます。Rust と Ethereum RPC エンドポイントが必要です。",
  s2DockerTitle: "クイックスタート（Docker）",
  s2CloneComment: "リポジトリをクローン",
  s2BuildComment: "ビルドして起動",
  s2SourceTitle: "ソースからビルド",
  s2PrereqComment: "前提条件: Rust 1.86+, Node.js 20+",
  s2BackendComment: "バックエンドをビルド",
  s2FrontendComment: "フロントエンドをビルド",
  s2RunComment: "起動",
  s2EnvTitle: "環境変数",
  envVar: "変数名",
  envRequired: "必須",
  envDesc: "説明",
  envRows: [
    ["DB_PATH", "いいえ", "SQLite データベースのパス（デフォルト: ./ari-dex.db）"],
    ["ETH_RPC_URL", "はい*", "Ethereum JSON-RPC エンドポイント（Alchemy、Infura 等）"],
    ["SOLVER_PRIVATE_KEY", "はい*", "ソルバーウォレットの秘密鍵（オンチェーン決済用）"],
    ["EXECUTOR_ENABLED", "いいえ", "\"true\" でオンチェーン実行を有効化"],
    ["SUBGRAPH_API_KEY", "いいえ", "The Graph API キー（ライブプールデータ取得用）"],
    ["CHAIN_ID", "いいえ", "チェーン ID（デフォルト: 1 = Ethereum メインネット）"],
    ["SETTLEMENT_ADDRESS", "いいえ", "Settlement コントラクトアドレス（デフォルト設定済み）"],
  ] as [string, string, string][],
  envNote: "* オンチェーン決済に必須。未設定の場合はドライランモードで動作します。",

  s3Title: "3. インフラをスケールする",
  s3Desc:
    "Fly.io、AWS、その他のクラウドプロバイダーに ARI ゲートウェイをデプロイできます。各ノードは独立して Ethereum に直接接続します。",
  s3FlyTitle: "Fly.io にデプロイ",
  s3InstallComment: "をインストール",
  s3CreateComment: "アプリを作成",
  s3VolumeComment: "DB 用の永続ボリュームを作成",
  s3SecretsComment: "シークレットを設定（CLI引数に秘密鍵を出さない！）",
  s3DeployComment: "デプロイ",
  s3MultiTitle: "マルチリージョン構成",
  s3MultiComment: "低レイテンシのためにリージョンを追加",
  s3VolumeEachComment: "各リージョンにボリュームが必要",

  s4Title: "4. API リファレンス",
  s4Desc: "全エンドポイントは以下で利用可能:",
  apiMethod: "メソッド",
  apiEndpoint: "エンドポイント",
  apiDesc: "説明",
  apiRows: [
    ["GET", "/health", "ヘルスチェック（DB・ソルバー状態）"],
    ["GET", "/v1/metrics", "ネットワーク統計（intent・約定・ソルバー数）"],
    ["POST", "/v1/intents", "スワップ intent を送信"],
    ["GET", "/v1/intents?status=pending", "ステータスで intent を一覧取得"],
    ["GET", "/v1/quote?sell_token=ETH&buy_token=USDC&sell_amount=1000000000000000000", "価格見積もりを取得"],
    ["GET", "/v1/pools", "Uniswap V3 プールデータ（ライブ）"],
    ["GET", "/v1/solvers", "稼働中ソルバー一覧"],
    ["POST", "/v1/solvers/register", "ソルバーとして登録"],
    ["GET", "/v1/settlement/status", "オンチェーン実行ステータス"],
    ["GET", "/ws", "WebSocket（リアルタイム intent + 価格）"],
  ] as [string, string, string][],

  s5Title: "5. WebSocket 連携",
  s5Desc:
    "WebSocket に接続して、intent と価格のリアルタイム更新を受信できます。レイテンシを最小化するためにソルバーには推奨です。",
  s5IntentComment: "新しい intent が投稿された - 約定可能かチェック",
  s5PriceComment: "価格ティッカー更新",

  s6Title: "6. アーキテクチャ",
  s6User: "ユーザー (フロントエンド)",
  s6SignedIntent: "署名済み intent",
  s6Polling: "秒ポーリング",
  s6PriceFeeds: "価格フィード (CoinGecko + CryptoCompare)",
  s6Matching: "Intent マッチング + 約定計算",
  s6Transfers: "トークン移転 + イベント発行",
  s6LiquiditySource: "流動性ソース",

  openSource: "オープンソース",
  openSourceDesc: "ARI は完全にオープンソースです。コントリビューション歓迎。",
  viewGithub: "GitHub で見る",
};

const en = {
  heroTitle: "Run ARI Infrastructure",
  heroSub:
    "Join the ARI network as a solver, run your own node, or scale the infrastructure. Earn fees by settling user intents on Ethereum.",
  activeSolvers: "Active Solvers",
  totalFills: "Total Fills",
  intentsSettled: "Intents Settled",

  s1Title: "1. Become a Solver",
  s1Desc:
    "Solvers compete to fill user intents at the best price. When you settle an intent, you earn the spread as profit. No minimum stake required to start.",
  s1RegisterTitle: "Register via API",
  s1HowTitle: "How Solving Works",
  s1Steps: [
    'User submits an intent (e.g. "swap 1 ETH for at least 2000 USDC")',
    'Your solver receives the intent via WebSocket or polling <code>GET /v1/intents?status=pending</code>',
    "Compute the best execution route (Uniswap, aggregators, your own liquidity)",
    "Call <code>Settlement.settle()</code> on-chain to fill the intent",
    "You keep the price improvement as profit (typically 0.01-0.1%)",
  ],
  s1ContractTitle: "Settlement Contract",

  s2Title: "2. Run Your Own Node",
  s2Desc:
    "Run the full ARI gateway with solver worker to participate in the network. Requires Rust and an Ethereum RPC endpoint.",
  s2DockerTitle: "Quick Start (Docker)",
  s2CloneComment: "Clone the repo",
  s2BuildComment: "Build and run",
  s2SourceTitle: "Build from Source",
  s2PrereqComment: "Prerequisites: Rust 1.86+, Node.js 20+",
  s2BackendComment: "Build backend",
  s2FrontendComment: "Build frontend",
  s2RunComment: "Run",
  s2EnvTitle: "Environment Variables",
  envVar: "Variable",
  envRequired: "Required",
  envDesc: "Description",
  envRows: [
    ["DB_PATH", "No", "SQLite database path (default: ./ari-dex.db)"],
    ["ETH_RPC_URL", "Yes*", "Ethereum JSON-RPC endpoint (Alchemy, Infura, etc.)"],
    ["SOLVER_PRIVATE_KEY", "Yes*", "Private key of solver wallet (for on-chain settlement)"],
    ["EXECUTOR_ENABLED", "No", 'Set to "true" to enable on-chain execution'],
    ["SUBGRAPH_API_KEY", "No", "The Graph API key for live pool data"],
    ["CHAIN_ID", "No", "Chain ID (default: 1 for Ethereum mainnet)"],
    ["SETTLEMENT_ADDRESS", "No", "Settlement contract address (has default)"],
  ] as [string, string, string][],
  envNote: "* Required for on-chain settlement. Without these, the node runs in dry-run mode.",

  s3Title: "3. Scale the Infrastructure",
  s3Desc:
    "Deploy your own ARI gateway on Fly.io, AWS, or any cloud provider. Each node is independent and connects to Ethereum directly.",
  s3FlyTitle: "Deploy to Fly.io",
  s3InstallComment: "Install",
  s3CreateComment: "Create app",
  s3VolumeComment: "Create persistent volume for DB",
  s3SecretsComment: "Set secrets (never in CLI args!)",
  s3DeployComment: "Deploy",
  s3MultiTitle: "Multi-Region Setup",
  s3MultiComment: "Add regions for lower latency",
  s3VolumeEachComment: "Each region needs its own volume",

  s4Title: "4. API Reference",
  s4Desc: "All endpoints are available at",
  apiMethod: "Method",
  apiEndpoint: "Endpoint",
  apiDesc: "Description",
  apiRows: [
    ["GET", "/health", "Health check with DB/solver status"],
    ["GET", "/v1/metrics", "Network metrics (intents, fills, solvers)"],
    ["POST", "/v1/intents", "Submit a swap intent"],
    ["GET", "/v1/intents?status=pending", "List intents by status"],
    ["GET", "/v1/quote?sell_token=ETH&buy_token=USDC&sell_amount=1000000000000000000", "Get price quote"],
    ["GET", "/v1/pools", "Live Uniswap V3 pool data"],
    ["GET", "/v1/solvers", "List active solvers"],
    ["POST", "/v1/solvers/register", "Register as a solver"],
    ["GET", "/v1/settlement/status", "On-chain executor status"],
    ["GET", "/ws", "WebSocket (real-time intents + prices)"],
  ] as [string, string, string][],

  s5Title: "5. WebSocket Integration",
  s5Desc:
    "Connect to the WebSocket for real-time intent and price updates. Recommended for solvers to minimize latency.",
  s5IntentComment: "New intent submitted - check if you can fill it",
  s5PriceComment: "Price ticker update",

  s6Title: "6. Architecture",
  s6User: "User (Frontend)",
  s6SignedIntent: "signed intent",
  s6Polling: "s polling",
  s6PriceFeeds: "Price feeds (CoinGecko + CryptoCompare)",
  s6Matching: "Intent matching + fill calculation",
  s6Transfers: "transfers + event emission",
  s6LiquiditySource: "liquidity source",

  openSource: "Open Source",
  openSourceDesc: "ARI is fully open source. Contributions welcome.",
  viewGithub: "View on GitHub",
};
