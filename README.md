# Nostr新規ユーザー検出システム

Nostrプロトコルにおける新規ユーザーと孤立ユーザーを検出し、推薦するAPIシステムです。

## 🏗️ プロジェクト構造

```
nostr-toss-up/
├── cloudflare-workers/          # 🚀 本番用 Cloudflare Workers実装
│   ├── src/                     # Workers用ソースコード
│   ├── migrations/              # D1データベースマイグレーション
│   ├── wrangler.jsonc          # Cloudflare Workers設定
│   └── README.md               # Workers版の詳細ドキュメント
├── express-api/                 # 🧪 開発用 Express API実装
│   ├── src/                     # Express用ソースコード
│   ├── data/                    # JSONデータファイル
│   ├── scripts/                 # データ収集スクリプト
│   └── README.md               # Express版の詳細ドキュメント
├── DESIGN.md                    # システム設計書
├── IMPLEMENTATION_PLAN.md       # 実装計画書
├── CLOUDFLARE_WORKERS_MIGRATION_PLAN.md  # Workers移行計画
└── NEW_USER_DETECTION_PLAN.md  # 新規ユーザー検出設計
```

## 🎯 実装版の選択

### 🚀 本番環境推奨: Cloudflare Workers版

**ディレクトリ:** `cloudflare-workers/`

**特徴:**
- ✅ サーバーレス・高性能・低コスト
- ✅ D1データベースによる永続化
- ✅ KVストアによる高速キャッシュ
- ✅ 自動スケーリング
- ✅ Cronジョブによる自動データ収集
- ✅ pubkeyベースの確実な新規ユーザー検出

**本番URL:** https://nostr-toss-up-workers.konnichiha7898.workers.dev

### 🧪 開発・学習用: Express API版

**ディレクトリ:** `express-api/`

**特徴:**
- ✅ シンプルなNode.js + Express実装
- ✅ JSONファイルベースのデータ保存
- ✅ ローカル開発に適している
- ✅ 理解しやすい構造

## 🚀 クイックスタート

### Cloudflare Workers版（推奨）

```bash
cd cloudflare-workers

# 依存関係インストール
npm install

# ローカル開発
npm run dev

# 本番デプロイ
npm run deploy
```

### Express API版

```bash
cd express-api

# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# データ収集
npm run collect
```

## 📋 API エンドポイント

両実装で共通のAPIエンドポイント：

- `GET /` - システム情報
- `GET /users` - 推薦ユーザー一覧
- `GET /posts` - 推薦投稿一覧
- `GET /health` - ヘルスチェック（Workers版のみ）
- `GET /stats` - 統計情報（Workers版のみ）
- `GET /check-user/{pubkey}` - 新規ユーザー判定（Workers版のみ）

## 🔧 主要機能

### 新規ユーザー検出
- pubkeyベースの確実な追跡（Workers版）
- 30日以内の新規登録者判定
- データベースによる永続化

### 推薦システム
- 新規ユーザーの自動推薦
- 孤立ユーザーの検出と推薦
- PageRankアルゴリズムによる影響力分析
- 日本語ユーザーのフィルタリング

### 自動データ収集
- 毎日午前0時（UTC）の自動実行
- Nostrリレーからのリアルタイムデータ取得
- プロフィール・投稿・フォロー関係の分析

## 📖 ドキュメント

- [システム設計書](DESIGN.md) - 全体的なシステム設計
- [実装計画書](IMPLEMENTATION_PLAN.md) - 開発計画
- [Workers移行計画](CLOUDFLARE_WORKERS_MIGRATION_PLAN.md) - Cloudflare Workers版の詳細設計
- [新規ユーザー検出設計](NEW_USER_DETECTION_PLAN.md) - 新規ユーザー検出機能の設計

## 🤝 開発に参加

1. リポジトリをフォーク
2. フィーチャーブランチを作成
3. 変更をコミット
4. プルリクエストを作成

## 📄 ライセンス

MIT License

## 🙏 謝辞

- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) - Nostrプロトコル実装
- [Cloudflare Workers](https://workers.cloudflare.com/) - サーバーレス実行環境
- Nostrコミュニティ - プロトコルの開発と普及
