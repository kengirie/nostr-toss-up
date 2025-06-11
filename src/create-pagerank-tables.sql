-- フォロー関係を保存するテーブル
CREATE TABLE IF NOT EXISTS follows (
  follower TEXT NOT NULL,
  following TEXT NOT NULL,
  PRIMARY KEY (follower, following),
  FOREIGN KEY (follower) REFERENCES users(pubkey),
  FOREIGN KEY (following) REFERENCES users(pubkey)
);

-- PageRankスコアを保存するテーブル
CREATE TABLE IF NOT EXISTS pagerank_scores (
  pubkey TEXT UNIQUE NOT NULL PRIMARY KEY,
  score REAL NOT NULL,
  rank INTEGER,
  FOREIGN KEY (pubkey) REFERENCES users(pubkey)
);

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_follower ON follows(follower);
CREATE INDEX IF NOT EXISTS idx_following ON follows(following);
CREATE INDEX IF NOT EXISTS idx_score ON pagerank_scores(score);
CREATE INDEX IF NOT EXISTS idx_rank ON pagerank_scores(rank);
