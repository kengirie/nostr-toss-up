# Nostr新規ユーザー検出システム - Express API版

Node.js + Express + TypeScript + JSONファイルベースの実装です。

## 🚀 セットアップ

### 依存関係のインストール

```bash
npm install
```

### 開発サーバーの起動

```bash
npm run dev
```

### データ収集（手動実行）

```bash
npm run collect
```

### 本番ビルド

```bash
npm run build
npm start
```

## 📋 API エンドポイント

- `GET /users` - 推薦ユーザー一覧
- `GET /posts` - 推薦投稿一覧

## 🗄️ データ保存

- `data/users.json` - 推薦ユーザーデータ
- `data/posts.json` - 推薦投稿データ

## 🔄 データ収集

`scripts/collect.ts` でNostrリレーからデータを収集し、JSONファイルに保存します。

## 📝 注意

この実装は学習・開発用です。本番環境では `../cloudflare-workers/` のCloudflare Workers版を使用することを推奨します。
