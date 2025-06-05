# Nostr新規ユーザー検出システム - Cloudflare Workers版

Nostrプロトコルにおける新規ユーザーと孤立ユーザーを検出し、推薦するAPIシステムです。Cloudflare Workers + D1データベースで構築されています。

## 🎯 主要機能

- **新規ユーザー検出**: pubkeyベースで30日以内の新規登録者を判定
- **推薦API**: 新規ユーザーと孤立ユーザーの推薦リストを提供
- **自動データ収集**: 毎日午前0時（UTC）に自動でNostrリレーからデータを収集
- **高性能キャッシュ**: KVストアによる高速レスポンス
- **スケーラブル**: Cloudflare Workersの自動スケーリング

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

## 🚀 セットアップ

### 1. 前提条件

- Node.js 18+
- Cloudflareアカウント
- Wrangler CLI

### 2. プロジェクトのクローン

```bash
git clone <repository-url>
cd cloudflare-workers
```

### 3. 依存関係のインストール

```bash
npm install
```

### 4. Cloudflareにログイン

```bash
npx wrangler login
```

### 5. D1データベースの作成

```bash
npm run db:create
```

作成されたデータベースIDを`wrangler.jsonc`の`database_id`に設定してください。

### 6. KVネームスペースの作成

```bash
npx wrangler kv:namespace create "CACHE"
```

作成されたKV IDを`wrangler.jsonc`の`kv_namespaces`に設定してください。

### 7. データベースマイグレーション

```bash
npm run db:migrate
```

### 8. 開発サーバーの起動

```bash
npm run dev
```

### 9. デプロイ

```bash
npm run deploy
```

## 🔧 設定

### wrangler.jsonc

主要な設定項目：

```jsonc
{
  "name": "nostr-toss-up-workers",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "nostr-users-db",
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

### 環境変数

現在、環境変数は使用していませんが、将来的にリレーURLなどを設定可能にする予定です。

## 📊 データベーススキーマ

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

## 🎛️ 運用

### ログ監視

Cloudflare Workersのダッシュボードでログを確認できます：

```bash
npx wrangler tail
```

### データベース操作

```bash
# データベースの内容確認
npx wrangler d1 execute nostr-users-db --command "SELECT COUNT(*) FROM user_registrations"

# 手動でのデータクリーンアップ
npx wrangler d1 execute nostr-users-db --command "DELETE FROM user_registrations WHERE first_seen_at < strftime('%s', 'now', '-60 days')"
```

### キャッシュ管理

```bash
# KVストアの内容確認
npx wrangler kv:key list --namespace-id=your-kv-id

# 特定のキーを削除
npx wrangler kv:key delete "recommended_users" --namespace-id=your-kv-id
```

## 📈 パフォーマンス

- **レスポンス時間**: 通常200ms以下
- **キャッシュヒット率**: 80%以上を目標
- **データ更新頻度**: 毎日1回
- **同時リクエスト処理**: Cloudflare Workersの制限内で無制限

## 🔒 セキュリティ

- **レート制限**: 実装予定
- **入力検証**: pubkey形式の厳密な検証
- **SQLインジェクション対策**: Prepared Statements使用
- **CORS設定**: 適切なCORSヘッダー設定

## 🐛 トラブルシューティング

### よくある問題

1. **データベース接続エラー**
   - `wrangler.jsonc`のdatabase_idが正しく設定されているか確認
   - マイグレーションが実行されているか確認

2. **キャッシュが効かない**
   - KV namespace IDが正しく設定されているか確認
   - キャッシュキーの命名規則を確認

3. **Cronジョブが動かない**
   - `triggers.crons`が正しく設定されているか確認
   - Cloudflareダッシュボードでトリガーが有効になっているか確認

### デバッグ

```bash
# ローカルでの開発時
npm run dev

# 本番環境のログ確認
npx wrangler tail

# データベースの状態確認
npx wrangler d1 execute nostr-users-db --command "SELECT * FROM user_registrations LIMIT 10"
```

## 🤝 コントリビューション

1. フォークしてください
2. フィーチャーブランチを作成してください (`git checkout -b feature/amazing-feature`)
3. 変更をコミットしてください (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュしてください (`git push origin feature/amazing-feature`)
5. プルリクエストを開いてください

## 📄 ライセンス

MIT License

## 🙏 謝辞

- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) - Nostrプロトコルの実装
- [Cloudflare Workers](https://workers.cloudflare.com/) - サーバーレス実行環境
- Nostrコミュニティ - プロトコルの開発と普及
