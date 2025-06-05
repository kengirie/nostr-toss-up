# Nostr新規ユーザー検出システム - Cloudflare Workers版

Nostrプロトコルにおける新規ユーザーと孤立ユーザーを検出し、推薦するAPIシステムのCloudflare Workers実装です。

## 🚀 本番環境

**本番URL:** https://nostr-toss-up-workers.konnichiha7898.workers.dev

## 🎯 特徴

- ✅ **サーバーレス・高性能・低コスト** - Cloudflare Workersによる自動スケーリング
- ✅ **D1データベース** - SQLiteベースの高性能データベースによる永続化
- ✅ **KVストア** - 分散キャッシュによる高速レスポンス
- ✅ **pubkeyベースの新規ユーザー検出** - 30日以内の確実な判定
- ✅ **自動データ収集** - Cronジョブによる毎日午前0時（UTC）の自動実行
- ✅ **PageRankアルゴリズム** - ユーザー影響力の科学的分析
- ✅ **日本語ユーザーフィルタリング** - 日本語コミュニティに特化

## 🏗️ アーキテクチャ

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Nostr Relays  │───▶│ Cloudflare      │───▶│   Client Apps   │
│                 │    │ Workers         │    │                 │
└─────────────────┘    │                 │    └─────────────────┘
                       │ ┌─────────────┐ │
                       │ │ D1 Database │ │
                       │ └─────────────┘ │
                       │ ┌─────────────┐ │
                       │ │  KV Store   │ │
                       │ └─────────────┘ │
                       └─────────────────┘
```

## 📋 API エンドポイント

### 基本情報
- `GET /` - システム情報とエンドポイント一覧

### 推薦データ
- `GET /users` - 推薦ユーザー一覧
  - `?limit=50` - 取得件数（最大100）
  - `?reason=new_user|isolated_user` - 理由でフィルタ
- `GET /posts` - 推薦投稿一覧
  - `?limit=50` - 取得件数（最大100）
  - `?reason=from_new_user|from_isolated_user` - 理由でフィルタ

### ユーザー判定
- `GET /check-user/{pubkey}` - 新規ユーザー判定
  - pubkey: hex形式またはnpub形式

### システム情報
- `GET /health` - ヘルスチェック
- `GET /stats` - 統計情報

### 管理機能
- `POST /clear-cache` - キャッシュクリア

## 🚀 開発環境セットアップ

### 前提条件

- Node.js 18+
- Cloudflareアカウント
- Wrangler CLI

### インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd nostr-toss-up

# 依存関係のインストール
npm install
```

### ローカル開発

```bash
# 開発サーバー起動
npm run dev
# http://localhost:8787 でアクセス可能
```

### デプロイ

```bash
# 本番環境にデプロイ
npm run deploy
```

## 🗄️ データベース設計

### user_registrations
ユーザーの初回検出日時を記録

```sql
CREATE TABLE user_registrations (
    pubkey TEXT PRIMARY KEY,
    first_seen_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
```

### recommended_users
推薦ユーザーのキャッシュ

```sql
CREATE TABLE recommended_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pubkey TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    follower_count INTEGER,
    page_rank_score REAL,
    updated_at INTEGER NOT NULL
);
```

### recommended_posts
推薦投稿のキャッシュ

```sql
CREATE TABLE recommended_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nevent TEXT NOT NULL,
    author_pubkey TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    content TEXT,
    updated_at INTEGER NOT NULL
);
```

## 🔄 データ収集フロー

1. **プロフィール取得**: Nostrリレーからkind:0イベントを収集
2. **フォローグラフ構築**: kind:3イベントからフォロー関係を分析
3. **PageRank計算**: ユーザーの影響力スコアを算出
4. **新規ユーザー検出**: 30日以内の初回検出ユーザーを特定
5. **孤立ユーザー検出**: 低いPageRankスコアのユーザーを特定
6. **投稿収集**: 対象ユーザーの最新投稿を収集
7. **データ保存**: D1データベースに結果を保存

## 📁 プロジェクト構造

```
nostr-toss-up/
├── cloudflare-workers/          # Cloudflare Workers実装
│   ├── src/
│   │   ├── handlers/            # API・Cronハンドラー
│   │   ├── services/            # ビジネスロジック
│   │   ├── types/               # 型定義
│   │   ├── utils/               # ユーティリティ
│   │   └── index.ts             # エントリーポイント
│   ├── migrations/              # D1データベースマイグレーション
│   ├── wrangler.jsonc          # Cloudflare Workers設定
│   └── package.json            # 依存関係
├── DESIGN.md                    # システム設計書
├── IMPLEMENTATION_PLAN.md       # 実装計画書
├── CLOUDFLARE_WORKERS_MIGRATION_PLAN.md  # Workers移行計画
├── NEW_USER_DETECTION_PLAN.md  # 新規ユーザー検出設計
└── README.md                   # このファイル
```

## 🔧 設定

### 環境設定

主要な設定は `wrangler.jsonc` で管理：

```jsonc
{
  "name": "nostr-toss-up-workers",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "nostr-users-db-prod",
      "database_id": "your-database-id"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "CACHE",
      "id": "your-kv-id"
    }
  ],
  "triggers": {
    "crons": ["0 0 * * *"]
  }
}
```

## 🔄 更新・デプロイ

### 通常の更新

```bash
# コード変更後
npm run deploy
```

### データベーススキーマ変更

```bash
# 新しいマイグレーション作成後
npx wrangler d1 migrations apply nostr-users-db-prod --remote
npm run deploy
```

## 📊 運用・監視

### ログ確認

```bash
# リアルタイムログ
npx wrangler tail
```

### データベース操作

```bash
# データベースの状態確認
npx wrangler d1 execute nostr-users-db-prod --command "SELECT COUNT(*) FROM user_registrations"
```

### パフォーマンス

- **レスポンス時間**: 通常100ms以下
- **キャッシュヒット率**: 80%以上
- **データ更新頻度**: 毎日1回
- **同時リクエスト処理**: Cloudflare Workersの制限内で無制限

## 🤝 コントリビューション

1. フォークしてください
2. フィーチャーブランチを作成してください (`git checkout -b feature/amazing-feature`)
3. 変更をコミットしてください (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュしてください (`git push origin feature/amazing-feature`)
5. プルリクエストを開いてください

## 📄 ライセンス

MIT License

## 🙏 謝辞

- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) - Nostrプロトコル実装
- [Cloudflare Workers](https://workers.cloudflare.com/) - サーバーレス実行環境
- Nostrコミュニティ - プロトコルの開発と普及

## 🔗 関連プロジェクト

- **Express API版**: シンプルなNode.js実装（学習・開発用）
  - 別リポジトリ: `nostr-toss-up-express`
