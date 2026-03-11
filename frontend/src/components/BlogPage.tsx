import { useState } from "react";

type Lang = "ja" | "en";

export function BlogPage() {
  const [lang, setLang] = useState<Lang>(() => {
    if (navigator.language.startsWith("ja")) return "ja";
    return "en";
  });

  const t = lang === "ja" ? ja : en;

  return (
    <div className="blog-page">
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

      <article className="blog-article">
        <header className="blog-header">
          <h1 className="blog-title">{t.title}</h1>
          <div className="blog-meta">
            <span>{t.date}</span>
            <span className="blog-meta-sep" />
            <span>{t.readTime}</span>
          </div>
        </header>

        {t.sections.map((section, i) => (
          <section key={i} className="blog-section">
            <h2 className="blog-section-title">{section.title}</h2>
            {section.paragraphs.map((p, j) => (
              <p key={j} className="blog-text" dangerouslySetInnerHTML={{ __html: p }} />
            ))}
            {section.milestone && (
              <div className="blog-milestone">
                <div className="blog-milestone-icon">{section.milestone.icon}</div>
                <div className="blog-milestone-text">{section.milestone.text}</div>
              </div>
            )}
            {section.stats && (
              <div className="blog-stats">
                {section.stats.map((stat, k) => (
                  <div key={k} className="blog-stat">
                    <span className="blog-stat-value">{stat[0]}</span>
                    <span className="blog-stat-label">{stat[1]}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

        <section className="blog-section blog-section--timeline">
          <h2 className="blog-section-title">{t.timelineTitle}</h2>
          <div className="blog-timeline">
            {t.timeline.map((item, i) => (
              <div key={i} className="blog-timeline-item">
                <div className="blog-timeline-dot" />
                <div className="blog-timeline-content">
                  <div className="blog-timeline-label">{item.label}</div>
                  <div className="blog-timeline-desc">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="blog-section">
          <h2 className="blog-section-title">{t.techTitle}</h2>
          <div className="blog-tech-grid">
            {t.techStack.map((tech, i) => (
              <div key={i} className="blog-tech-card">
                <div className="blog-tech-name">{tech[0]}</div>
                <div className="blog-tech-desc">{tech[1]}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="blog-section">
          <h2 className="blog-section-title">{t.futureTitle}</h2>
          {t.futureParagraphs.map((p, i) => (
            <p key={i} className="blog-text" dangerouslySetInnerHTML={{ __html: p }} />
          ))}
        </section>
      </article>
    </div>
  );
}

interface Section {
  title: string;
  paragraphs: string[];
  milestone?: { icon: string; text: string };
  stats?: [string, string][];
}

const ja = {
  title: "ARI DEX 開発記 ― ゼロから Ethereum メインネットまで",
  date: "2026年3月11日",
  readTime: "15分で読めます",

  sections: [
    {
      title: "なぜ Intent-based DEX を作ったのか",
      paragraphs: [
        "既存の DEX には大きな問題があります。<strong>MEV（Maximal Extractable Value）</strong>です。ユーザーがスワップを実行すると、メンプール上でサンドイッチ攻撃を受け、数百ドルの損失が日常的に発生しています。",
        "ARI（Arithmetic of Intents）は、この問題を根本から解決するために設計されました。ユーザーは「1 ETH を最低 2000 USDC で交換したい」という<strong>意図（intent）</strong>を署名するだけ。実際の執行は、競争入札を通じて最も有利な価格を提示したソルバーが行います。",
        "この仕組みにより、フロントランニングは構造的に不可能になり、ユーザーは常にベストプライスで取引できます。",
      ],
    },
    {
      title: "Phase 0: 設計とプロトコル仕様",
      paragraphs: [
        "最初の一歩は、ホワイトペーパーの執筆でした。既存の intent ベースのプロトコル（CoW Protocol、UniswapX、1inch Fusion）を徹底的に調査し、それぞれの長所と限界を分析しました。",
        "ARI の設計で重視したのは3点：<strong>暗号化メンプール</strong>（AES-256-GCM + Shamir Secret Sharing でサンドイッチ攻撃を防止）、<strong>ハイブリッドマッチング</strong>（小口は CLMM、大口はバッチオークション）、<strong>オープンソルバー競争</strong>（誰でもソルバーとして参加可能）です。",
        "ブランド名 ARI は「Arithmetic of Intents」の略。数学的に正しい intent 決済を意味しています。",
      ],
      milestone: { icon: "📐", text: "プロトコル仕様 v1.0 完成" },
    },
    {
      title: "Phase 1: Rust コアエンジンの構築",
      paragraphs: [
        "バックエンドは最初から <strong>Rust</strong> で書くと決めていました。金融プロトコルにはメモリ安全性とパフォーマンスの両方が不可欠だからです。",
        "<strong>ari-engine</strong> クレートでは、集中流動性（CLMM）の数学を Q64.96 固定小数点で実装。ティックベースの価格計算、スワップステップの分割処理、バッチオークションの均一清算価格アルゴリズムを組み込みました。",
        "<strong>ari-solver</strong> では、Dijkstra のマルチホップパスファインディング（最大3ホップ）とダッチオークション方式のスコアリングを実装。ソルバーは価格改善、ガス効率、信頼性スコアで競争します。",
        "<strong>ari-crypto</strong> では、AES-256-GCM によるメンプール暗号化と Shamir Secret Sharing による閾値暗号を実装しました。",
      ],
      stats: [
        ["6", "Rust クレート"],
        ["46", "テスト全パス"],
        ["8,000+", "行のRustコード"],
      ],
    },
    {
      title: "Phase 2: 13のスマートコントラクト",
      paragraphs: [
        "Solidity 0.8.24 で 13 のコントラクトを実装しました。コアの <strong>Settlement.sol</strong> は EIP-712 型付きデータ署名でインテントを検証し、SafeERC20 でアトミックなトークン移転を実行します。",
        "<strong>Vault.sol</strong> は Uniswap V3 スタイルの集中流動性マーケットメーカー。LP はティック範囲を指定して流動性を提供し、ERC-721 NFT でポジションを管理します。",
        "さらに、<strong>ConditionalIntent</strong>（指値注文・ストップロス・DCA）、<strong>PerpetualMarket</strong>（最大20倍レバレッジ）、<strong>CrossChainIntent</strong>（ERC-7683 準拠のクロスチェーン決済）、<strong>AriPaymaster</strong>（ERC-4337 ガスレス取引）など、DeFi のフルスタックをカバーしました。",
        "188 個の Foundry テストで全機能を検証。リエントランシー攻撃、署名偽造、期限切れ intent の拒否など、セキュリティケースも網羅しています。",
      ],
      milestone: { icon: "🔗", text: "13 コントラクト、Ethereum メインネットにデプロイ完了" },
      stats: [
        ["13", "コントラクト"],
        ["188", "Foundry テスト"],
        ["2,554", "行の Solidity"],
      ],
    },
    {
      title: "Phase 3: フロントエンドと API ゲートウェイ",
      paragraphs: [
        "フロントエンドは <strong>React + TypeScript + Vite</strong> で構築。wagmi v2 でウォレット接続、viem で Ethereum RPC 通信を行います。",
        "API ゲートウェイは <strong>axum 0.7</strong>（Rust の非同期 Web フレームワーク）で構築。REST API に加え、WebSocket でリアルタイム価格とインテント更新を配信します。",
        "ユーザーがスワップを実行する流れ：フロントエンドで EIP-712 署名 → API にインテント送信 → ソルバーワーカーが自動マッチング → Settlement コントラクトでオンチェーン決済。すべてが自動で回ります。",
        "バックエンドには IP ベースのレート制限（100 req/min）、CoinGecko + CryptoCompare のデュアル価格フィード、SQLite WAL モードの永続化、The Graph Subgraph による Uniswap V3 プールデータの取得も組み込みました。",
      ],
    },
    {
      title: "Phase 4: EIP-712 署名とソルバー自動実行",
      paragraphs: [
        "最も技術的にチャレンジングだったのは、<strong>EIP-712 署名検証の完全な一貫性</strong>です。Solidity の Settlement.sol、Rust のバックエンド（k256 + tiny-keccak）、TypeScript のフロントエンド（wagmi signTypedData）の3箇所でドメインセパレータとタイプハッシュを完全に一致させる必要がありました。",
        "フィールド順序の不一致（sellToken, buyToken, sellAmount vs sellToken, sellAmount, buyToken）に何時間も悩まされましたが、最終的に全レイヤーで Solidity の定義に統一して解決。",
        "<strong>ソルバーワーカー</strong>は 5 秒間隔でペンディングインテントをポーリングし、価格フィードから最適な執行価格を計算、Settlement コントラクトの settle() を呼び出します。これにより、ノードを立ち上げるだけでインテントが自動的に決済されます。",
      ],
    },
    {
      title: "Phase 5: デプロイとインフラ",
      paragraphs: [
        "バックエンドは <strong>Fly.io</strong> の東京リージョン（nrt）にデプロイ。Docker マルチステージビルドで Rust バイナリ + Node.js フロントエンドを1つのイメージに。SQLite データベースは永続ボリュームにマウント。",
        "CI/CD は <strong>GitHub Actions</strong> で Rust テスト・Clippy・Foundry テスト・TypeScript ビルドを自動実行。すべてグリーンでないとマージできません。",
        "秘密鍵管理は <code>fly secrets import</code>（stdin 経由で CLI 履歴に残さない）、ローカルは <code>chmod 600</code> で保護。",
      ],
    },
  ] as Section[],

  timelineTitle: "開発タイムライン",
  timeline: [
    { label: "仕様策定", desc: "ホワイトペーパー、ブランディング、GitHub リポジトリ作成" },
    { label: "Rust コア", desc: "6 クレート実装 — エンジン、ソルバー、暗号、ゲートウェイ" },
    { label: "スマートコントラクト", desc: "13 コントラクト + 188 テスト（Foundry）" },
    { label: "メインネットデプロイ", desc: "全コントラクトを Ethereum メインネットにデプロイ" },
    { label: "フロントエンド", desc: "React UI — Swap, Pools, Portfolio, Solvers, LP, Docs" },
    { label: "API 公開", desc: "Fly.io 東京リージョンでライブ API 稼働" },
    { label: "自律実行", desc: "ソルバーワーカー、EIP-712 ecrecover、オンチェーン決済" },
    { label: "ドキュメント", desc: "JP/EN バイリンガルドキュメント、ブログ公開" },
  ],

  techTitle: "技術スタック",
  techStack: [
    ["Rust (axum 0.7)", "バックエンド API + ソルバーエンジン"],
    ["Solidity 0.8.24", "13 スマートコントラクト"],
    ["React + TypeScript", "フロントエンド UI"],
    ["wagmi v2 + viem", "ウォレット接続 + EIP-712 署名"],
    ["SQLite (WAL mode)", "インテント・ソルバー永続化"],
    ["Fly.io (Tokyo)", "インフラ・デプロイ"],
    ["k256 + tiny-keccak", "EIP-712 ECDSA 検証 (Rust)"],
    ["Foundry", "スマートコントラクトテスト"],
    ["GitHub Actions", "CI/CD パイプライン"],
    ["CoinGecko API", "リアルタイム価格フィード"],
  ] as [string, string][],

  futureTitle: "今後のロードマップ",
  futureParagraphs: [
    "<strong>マルチチェーン展開</strong> — Arbitrum と Base へのデプロイを準備中。クロスチェーンインテントの実運用を目指します。",
    "<strong>Chainlink オラクル</strong> — CoinGecko に依存しない分散型価格フィードへの移行。コントラクト上で直接 Chainlink の latestRoundData() を参照します。",
    "<strong>セキュリティ監査</strong> — 外部監査会社による全コントラクトの監査を予定。監査レポートは公開します。",
    "<strong>バグバウンティ</strong> — Critical 脆弱性に最大 $50,000 の報奨金プログラムを準備中。",
    "ARI は完全にオープンソースです。コードを読んで、ソルバーとして参加して、一緒に DeFi の未来を作りましょう。",
  ],
};

const en = {
  title: "Building ARI DEX ― From Zero to Ethereum Mainnet",
  date: "March 11, 2026",
  readTime: "15 min read",

  sections: [
    {
      title: "Why We Built an Intent-based DEX",
      paragraphs: [
        "Existing DEXs have a fundamental problem: <strong>MEV (Maximal Extractable Value)</strong>. When users execute swaps, they get sandwich-attacked in the mempool, losing hundreds of dollars daily.",
        "ARI (Arithmetic of Intents) was designed to solve this from the ground up. Users simply sign an <strong>intent</strong> like \"swap 1 ETH for at least 2000 USDC\". The actual execution is handled by solvers competing in a dutch auction to offer the best price.",
        "This architecture makes frontrunning structurally impossible, and users always get the best available price.",
      ],
    },
    {
      title: "Phase 0: Design & Protocol Specification",
      paragraphs: [
        "The first step was writing the whitepaper. We studied existing intent-based protocols (CoW Protocol, UniswapX, 1inch Fusion), analyzing the strengths and limitations of each.",
        "ARI's design prioritized three things: an <strong>encrypted mempool</strong> (AES-256-GCM + Shamir Secret Sharing to prevent sandwich attacks), <strong>hybrid matching</strong> (CLMM for small orders, batch auctions for large ones), and <strong>open solver competition</strong> (anyone can participate as a solver).",
        "The name ARI stands for \"Arithmetic of Intents\" \u2014 mathematically sound intent settlement.",
      ],
      milestone: { icon: "\ud83d\udcd0", text: "Protocol specification v1.0 complete" },
    },
    {
      title: "Phase 1: Building the Rust Core Engine",
      paragraphs: [
        "We chose <strong>Rust</strong> from day one. Financial protocols demand both memory safety and performance.",
        "The <strong>ari-engine</strong> crate implements concentrated liquidity (CLMM) math with Q64.96 fixed-point arithmetic, tick-based price calculations, swap step splitting, and batch auction uniform clearing price algorithms.",
        "The <strong>ari-solver</strong> crate features Dijkstra multi-hop pathfinding (up to 3 hops) and dutch auction scoring. Solvers compete on price improvement, gas efficiency, and reliability scores.",
        "The <strong>ari-crypto</strong> crate implements AES-256-GCM mempool encryption and Shamir Secret Sharing for threshold cryptography.",
      ],
      stats: [
        ["6", "Rust crates"],
        ["46", "tests passing"],
        ["8,000+", "lines of Rust"],
      ],
    },
    {
      title: "Phase 2: 13 Smart Contracts",
      paragraphs: [
        "We implemented 13 contracts in Solidity 0.8.24. The core <strong>Settlement.sol</strong> verifies EIP-712 typed data signatures and executes atomic token transfers via SafeERC20.",
        "<strong>Vault.sol</strong> is a Uniswap V3-style concentrated liquidity market maker. LPs specify tick ranges for liquidity provision and manage positions via ERC-721 NFTs.",
        "We also built <strong>ConditionalIntent</strong> (limit orders, stop-loss, DCA), <strong>PerpetualMarket</strong> (up to 20x leverage), <strong>CrossChainIntent</strong> (ERC-7683 compliant cross-chain settlement), and <strong>AriPaymaster</strong> (ERC-4337 gasless trading).",
        "All functionality is verified by 188 Foundry tests covering reentrancy attacks, signature forgery, expired intent rejection, and more.",
      ],
      milestone: { icon: "\ud83d\udd17", text: "13 contracts deployed to Ethereum mainnet" },
      stats: [
        ["13", "contracts"],
        ["188", "Foundry tests"],
        ["2,554", "lines of Solidity"],
      ],
    },
    {
      title: "Phase 3: Frontend & API Gateway",
      paragraphs: [
        "The frontend is built with <strong>React + TypeScript + Vite</strong>, using wagmi v2 for wallet connections and viem for Ethereum RPC.",
        "The API gateway runs on <strong>axum 0.7</strong> (Rust async web framework), serving REST APIs plus WebSocket channels for real-time price and intent updates.",
        "The swap flow: frontend EIP-712 signing \u2192 submit intent to API \u2192 solver worker auto-matches \u2192 Settlement contract executes on-chain. Fully autonomous.",
        "The backend includes IP-based rate limiting (100 req/min), dual price feeds (CoinGecko + CryptoCompare), SQLite WAL persistence, and The Graph Subgraph for Uniswap V3 pool data.",
      ],
    },
    {
      title: "Phase 4: EIP-712 Signatures & Solver Auto-Execution",
      paragraphs: [
        "The most technically challenging part was achieving <strong>complete EIP-712 signature consistency</strong> across three layers: Solidity Settlement.sol, Rust backend (k256 + tiny-keccak), and TypeScript frontend (wagmi signTypedData).",
        "A field order mismatch (sellToken, buyToken, sellAmount vs sellToken, sellAmount, buyToken) cost us hours of debugging, but we ultimately unified all layers to match the Solidity definition.",
        "The <strong>solver worker</strong> polls pending intents every 5 seconds, computes optimal execution prices from price feeds, and calls Settlement.settle() on-chain. Just start a node and intents get settled automatically.",
      ],
    },
    {
      title: "Phase 5: Deployment & Infrastructure",
      paragraphs: [
        "The backend is deployed on <strong>Fly.io</strong> in the Tokyo region (nrt). A multi-stage Docker build packages the Rust binary + Node.js frontend into a single image. SQLite runs on a persistent volume.",
        "<strong>GitHub Actions</strong> CI/CD runs Rust tests, Clippy, Foundry tests, and TypeScript builds automatically. Nothing merges unless everything is green.",
        "Secret management uses <code>fly secrets import</code> (via stdin to avoid CLI history) and local keys are protected with <code>chmod 600</code>.",
      ],
    },
  ] as Section[],

  timelineTitle: "Development Timeline",
  timeline: [
    { label: "Specification", desc: "Whitepaper, branding, GitHub repository setup" },
    { label: "Rust Core", desc: "6 crates \u2014 engine, solver, crypto, gateway" },
    { label: "Smart Contracts", desc: "13 contracts + 188 tests (Foundry)" },
    { label: "Mainnet Deploy", desc: "All contracts deployed to Ethereum mainnet" },
    { label: "Frontend", desc: "React UI \u2014 Swap, Pools, Portfolio, Solvers, LP, Docs" },
    { label: "API Launch", desc: "Live API on Fly.io Tokyo region" },
    { label: "Autonomous Execution", desc: "Solver worker, EIP-712 ecrecover, on-chain settlement" },
    { label: "Documentation", desc: "Bilingual JP/EN docs and blog published" },
  ],

  techTitle: "Tech Stack",
  techStack: [
    ["Rust (axum 0.7)", "Backend API + solver engine"],
    ["Solidity 0.8.24", "13 smart contracts"],
    ["React + TypeScript", "Frontend UI"],
    ["wagmi v2 + viem", "Wallet connection + EIP-712 signing"],
    ["SQLite (WAL mode)", "Intent & solver persistence"],
    ["Fly.io (Tokyo)", "Infrastructure & deployment"],
    ["k256 + tiny-keccak", "EIP-712 ECDSA verification (Rust)"],
    ["Foundry", "Smart contract testing"],
    ["GitHub Actions", "CI/CD pipeline"],
    ["CoinGecko API", "Real-time price feeds"],
  ] as [string, string][],

  futureTitle: "Roadmap",
  futureParagraphs: [
    "<strong>Multi-chain deployment</strong> \u2014 Arbitrum and Base deployments in progress. Targeting live cross-chain intents.",
    "<strong>Chainlink oracles</strong> \u2014 Moving to decentralized price feeds independent of CoinGecko. Contracts will call Chainlink's latestRoundData() directly.",
    "<strong>Security audit</strong> \u2014 External audit of all contracts planned. Audit reports will be published publicly.",
    "<strong>Bug bounty</strong> \u2014 Up to $50,000 bounty program for critical vulnerabilities in preparation.",
    "ARI is fully open source. Read the code, join as a solver, and let's build the future of DeFi together.",
  ],
};
