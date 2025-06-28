-- 結合条件に使用されるカラムにインデックスを追加
CREATE INDEX IF NOT EXISTS idx_last_posts_pubkey ON last_posts(pubkey);
CREATE INDEX IF NOT EXISTS idx_pagerank_scores_pubkey ON pagerank_scores(pubkey);

-- 既存のインデックスを確認（既に存在する場合は無視されます）
CREATE INDEX IF NOT EXISTS idx_last_post_date ON last_posts(last_post_date);
CREATE INDEX IF NOT EXISTS idx_score ON pagerank_scores(score);
