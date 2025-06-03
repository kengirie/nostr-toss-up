# Nostr投稿推薦API

**✅ 実装完了！** 新規ユーザーや孤立したユーザーの投稿を推薦するAPIサービスです。
**nostr-tools**を使用してリアルなNostrデータを収集・提供します。

## 🎯 概要

このAPIは、**wss://yabu.me**リレーからリアルデータを収集し、以下のユーザーの投稿を推薦します：
- **新規ユーザー**: アカウント作成から30日以内のユーザー（10名）
- **孤立ユーザー**: PageRankスコアが低いユーザー（10名）

## ✨ 実装済み機能

- **✅ リアルNostrデータ**: yabu.meリレーから実際のプロフィール・投稿を収集
- **✅ PageRankアルゴリズム**: ソーシャルグラフ分析による孤立度判定
- **✅ 本物のnpub/nevent**: 実際のNostr識別子を使用
- **✅ 高速データ収集**: 4秒で500+プロフィール、30,000+ユーザーのグラフ分析
- **✅ 自動分類**: 新規・孤立ユーザーの自動判定

## 🚀 クイックスタート

### 1. 依存関係のインストール

```bash
npm install
```

### 2. リアルデータ収集

```bash
npm run collect
```

**実際の処理内容:**
- yabu.meリレーに接続
- 500+のユーザープロフィールを取得
- 30,000+ユーザーのフォローグラフを構築
- PageRankスコアを計算
- 新規ユーザー10名を特定
- 孤立ユーザー10名を特定
- 最新投稿30件を収集
- 実際のnpub/nevent IDを生成

### 3. APIサーバー起動

```bash
# 開発モード
npm run dev

# 本番モード
npm run build
npm start
```

サーバーは `http://localhost:3000` で起動します。

## 📡 API エンドポイント

### 推薦ユーザー取得

```http
GET /users
```

**レスポンス例（実際のデータ）:**
```json
{
  "users": [
    {
      "pubkey": "npub1d30mhvhd0sagmu83wdm26wqk00heptfn05xvgmfx7r9xscstnfcs7xynp3",
      "reason": "new_user"
    },
    {
      "pubkey": "npub19we2h0793y4hhk500r2ndqkez0xf53rtghs3j20sjdwclh7tgz7s36kl6t",
      "reason": "new_user"
    },
    {
      "pubkey": "npub184l8wc3980x57rsd2gvjdyxef67tku4sdkhh4xpf0rmnw64ghpas3meh6g",
      "reason": "isolated_user"
    }
  ],
  "count": 20,
  "lastUpdated": "2025-06-03T13:01:46.264Z"
}
```

### 推薦投稿取得

```http
GET /posts
```

**レスポンス例（実際のデータ）:**
```json
{
  "posts": [
    {
      "nevent": "nevent1qyxhwumn8ghj77tpvf6jumt9qqspu0cs8tw977c288kxq0vm08fkrksagymevatdez2znatdy8dzdhc3cyfjp",
      "authorPubkey": "npub19we2h0793y4hhk500r2ndqkez0xf53rtghs3j20sjdwclh7tgz7s36kl6t",
      "createdAt": "2025-06-03T11:45:27.000Z",
      "reason": "from_new_user"
    },
    {
      "nevent": "nevent1qyxhwumn8ghj77tpvf6jumt9qqs2j6pm3er8vjvyu5vzs02wdh6nafzxcqz9tc69kcla6c7yp5r6tuqv4rfhu",
      "authorPubkey": "npub1hdcq7avmvn7pwr80jpzql4cpgczqw7dcwy24a77v4e7seztcdf9q2pjd3h",
      "createdAt": "2025-06-03T08:52:23.000Z",
      "reason": "from_new_user"
    }
  ],
  "count": 30,
  "lastUpdated": "2025-06-03T13:01:46.265Z"
}
```

## 🔧 使用方法

### cURLでのテスト

```bash
# 推薦ユーザー取得
curl http://localhost:3000/users

# 推薦投稿取得
curl http://localhost:3000/posts

# ヘルスチェック
curl http://localhost:3000/
```

### 定期データ収集

cron jobでデータ収集を自動化：

```bash
# crontab -e で以下を追加（毎日午前2時に実行）
0 2 * * * cd /path/to/nostr-toss-up && npm run collect
```

## 📁 プロジェクト構造

```
nostr-toss-up/
├── src/
│   ├── server.ts          # Express サーバー
│   ├── collector.ts       # データ収集ロジック
│   ├── types.ts           # TypeScript型定義
│   └── routes/
│       ├── users.ts       # ユーザー推薦API
│       └── posts.ts       # 投稿推薦API
├── scripts/
│   └── collect.ts         # データ収集スクリプト
├── data/                  # JSONデータファイル（自動生成）
│   ├── users.json
│   └── posts.json
├── package.json
├── tsconfig.json
├── DESIGN.md              # 設計書
└── README.md
```

## 🛠️ 開発

### スクリプト

```bash
# 開発サーバー起動（ホットリロード）
npm run dev

# TypeScriptビルド
npm run build

# 本番サーバー起動
npm start

# データ収集実行
npm run collect
```

### 環境変数

```bash
# ポート番号（デフォルト: 3000）
PORT=3000
```

## 📊 データ形式

### ユーザー判定基準（実装済み）

- **新規ユーザー**: アカウント作成から30日以内（実際のプロフィール作成日時を使用）
- **孤立ユーザー**: PageRankアルゴリズムによる低スコア判定（実際のフォローグラフを分析）

### データ収集詳細

- **リレー**: wss://yabu.me
- **分析対象**: 500+ユーザープロフィール
- **グラフサイズ**: 30,000+ユーザーのフォロー関係
- **収集時間**: 約4秒
- **更新頻度**: 手動実行（`npm run collect`）

### 技術仕様

- **nostr-tools**: 2.1.0
- **PageRank**: 10回反復、減衰係数0.85
- **データ形式**: 実際のnpub/nevent識別子
- **投稿期間**: 過去7日間の投稿を収集

## 🔮 今後の拡張予定

- [x] ✅ 実際のNostrリレーとの連携
- [x] ✅ PageRankによる高度な孤立度判定アルゴリズム
- [ ] 複数リレーからのデータ収集
- [ ] キャッシュ機能の追加
- [ ] 認証機能の追加
- [ ] メトリクス・監視機能

## 📄 ライセンス

MIT License
