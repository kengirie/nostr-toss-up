-- ユーザーの最終投稿日を保存するテーブル
CREATE TABLE IF NOT EXISTS last_posts (
  pubkey TEXT UNIQUE NOT NULL PRIMARY KEY,
  last_post_date INTEGER NOT NULL, -- UNIXタイムスタンプ（秒）
  FOREIGN KEY (pubkey) REFERENCES users(pubkey)
);

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_last_post_date ON last_posts(last_post_date);
