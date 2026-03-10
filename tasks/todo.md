# ARI DEX — タスク管理

## 完了済み

- [x] DEX仕様策定 — 13セクション、EN/JP 5ページ、OGP
- [x] 競合調査 — CoW Protocol, UniswapX, 1inch Fusion, Anoma, SUAVE, Across, Essential
- [x] ブランディング — ARI (Arithmetic of Intents)、ダークテーマ、パーティクルエフェクト
- [x] Rust workspace (6 crates) — cargo build --release passing
- [x] APIサーバー — 8 endpoints returning real JSON (axum, tower-http)
- [x] マッチングエンジン — CLMM + OrderBook + BatchAuction + HybridRouter (compiled)
- [x] Smart Contracts — Settlement.sol, Vault.sol, VaultFactory.sol, SolverRegistry.sol
- [x] Foundryテスト — 32テスト全パス (Settlement 14 + SolverRegistry 18)
- [x] Swap UI — React + Vite + wagmi、API接続、デモモード
- [x] Frontend + API単一サーバー配信 (tower-http ServeDir)
- [x] デプロイスクリプト — Deploy.s.sol (任意EVMチェーン)
- [x] GitHub — yukihamada/ari-dex + enablerdao/ari-dex
- [x] Fly.ioデプロイ — dex-spec.fly.dev (仕様サイト)
- [x] 日本語メイン化 — root=JA、en/=EN

---

## Phase 1 — MVP（テストネットデモ）

- [ ] Sepolia / Base Sepoliaにコントラクトデプロイ
- [ ] APIサーバーをFly.ioにデプロイ（ari-dex-api.fly.dev）
- [ ] ウォレット署名フロー（MetaMask → EIP-712 → Intent → Settlement）
- [ ] リアル価格取得 — Uniswap V3 / Chainlinkオラクル連携
- [ ] Intent永続化 — SQLite（インメモリから移行）
- [ ] Vault.sol テスト追加（CLMM + ERC-721 LP NFT）
- [ ] VaultFactory.sol テスト追加

## Phase 2 — コアプロトコル

- [ ] Solver Network — 外部ソルバーのインテント取得・競争入札
- [ ] 暗号化メモプール — BLS閾値暗号（MEV保護、型のみ→実装）
- [ ] バッチオークション — 250msリアルタイムスケジューリング
- [ ] CLMM数学実装 — sqrt price、tick bitmap、swap/mint/burn
- [ ] ガスレス取引 — ERC-4337 Account Abstraction
- [ ] WebSocket — リアルタイム価格フィード、オーダーブック更新
- [ ] クロスチェーンインテント — ERC-7683 (Solana bridging)

## Phase 3 — プロダクション

- [ ] セキュリティ監査（外部3社）
- [ ] Ethereum / Arbitrum / Base メインネットデプロイ
- [ ] ZK-Rollup決済 — L1証明提出
- [ ] $ARI トークン発行 — Work Token + veARI ガバナンス
- [ ] Buyback & Make プログラム

## インフラ / DevOps

- [ ] CI/CD — GitHub Actions（Rust test + Foundry test + Frontend build）
- [ ] モニタリング — Prometheus + Grafana
- [ ] ドキュメント — SDK / APIリファレンス / Solver開発ガイド
- [ ] ロードバランサー / CDN設定
- [ ] バグバウンティプログラム立ち上げ
