# ARI DEX — タスク管理

## 完了済み

### 基盤
- [x] DEX仕様策定 — 13セクション、EN/JP 5ページ、OGP
- [x] 競合調査 — CoW Protocol, UniswapX, 1inch Fusion, Anoma, SUAVE, Across, Essential
- [x] ブランディング — ARI (Arithmetic of Intents)、ダークテーマ、パーティクルエフェクト
- [x] GitHub — yukihamada/ari-dex + enablerdao/ari-dex
- [x] 日本語メイン化 — root=JA、en/=EN

### Rust (6 crates)
- [x] ari-core — 型定義、プロトコル定義
- [x] ari-crypto — AES-256-GCM + Shamir SSS 暗号化メモプール
- [x] ari-engine — CLMM (Q64.96), バッチオークション, ハイブリッドルーター
- [x] ari-gateway — 8+ REST API + WebSocket (axum 0.7)
- [x] ari-solver — Dijkstraルーティング, Dutchオークション, スコアリング
- [x] ari-node — サーバーバイナリ
- [x] セキュリティ強化 — CORS制限, 同時接続制限, tokio::Mutex, 入力バリデーション, WS制限

### Smart Contracts (13)
- [x] Settlement.sol — EIP-712署名検証
- [x] Vault.sol — CLMM + ERC-721 LP NFT + リエントランシーガード
- [x] VaultFactory.sol — EIP-1167 minimal proxy
- [x] SolverRegistry.sol — 100K $ARI ステーク + スラッシング
- [x] AriToken.sol — ERC-20 (1B cap)
- [x] VeARI.sol — 1-4年ロック、線形減衰
- [x] ConditionalIntent.sol — Limit / Stop Loss / Take Profit / DCA
- [x] PerpetualMarket.sol — 20x レバレッジ
- [x] CrossChainIntent.sol — ERC-7683 + エスクロー
- [x] IntentComposer.sol — アトミック複合インテント
- [x] PrivatePool.sol — ホワイトリストAMM
- [x] AriPaymaster.sol — ERC-4337 ガスレス
- [x] SimplePriceOracle.sol — 価格オラクル
- [x] Foundry 188テスト全パス
- [x] SafeERC20 全コントラクト適用

### Frontend
- [x] SwapPanel — React + Vite + wagmi
- [x] EIP-712 署名フロー (useSignIntent)
- [x] デモモード (dev only)
- [x] セキュリティ — HTTPS強制、入力バリデーション

### デプロイ
- [x] Ethereum メインネット — 全13コントラクト
- [x] Sourcify verify — Settlement (exact match)
- [x] API サーバー — ari-dex-api.fly.dev
- [x] Spec サイト — dex-spec.fly.dev
- [x] CI/CD — GitHub Actions (Rust + Foundry + Frontend)

---

## 残タスク

### Phase 3 — プロダクション拡張
- [ ] Sourcify/Etherscan 全コントラクト verify（実行中）
- [ ] Arbitrum / Base マルチチェーンデプロイ
- [ ] Chainlink オラクル連携（モック価格 → リアル価格）
- [ ] 外部セキュリティ監査
- [ ] BLS署名 本番実装（現在HMAC placeholder）

### インフラ
- [ ] モニタリング — Prometheus + Grafana
- [ ] CDN / ロードバランサー設定
- [ ] バグバウンティプログラム

### ドキュメント
- [ ] SDK / API リファレンス
- [ ] Solver 開発ガイド
- [ ] ホワイトペーパー（LaTeX）
