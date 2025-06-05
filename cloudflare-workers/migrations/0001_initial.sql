-- 新規ユーザー検出システム用のテーブル作成
-- ユーザー登録追跡テーブル
CREATE TABLE user_registrations (
    pubkey TEXT PRIMARY KEY,           -- ユーザーの公開鍵（hex形式）
    first_seen_at INTEGER NOT NULL,   -- 初回検出日時（Unix timestamp）
    created_at INTEGER NOT NULL       -- レコード作成日時（Unix timestamp）
);

-- インデックス作成（検索性能向上）
CREATE INDEX idx_first_seen_at ON user_registrations(first_seen_at);
CREATE INDEX idx_created_at ON user_registrations(created_at);

-- 推薦ユーザーテーブル（キャッシュ用）
CREATE TABLE recommended_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pubkey TEXT NOT NULL,
    reason TEXT NOT NULL,              -- 'new_user' or 'isolated_user'
    created_at INTEGER NOT NULL,
    follower_count INTEGER,
    page_rank_score REAL,
    updated_at INTEGER NOT NULL
);

-- 推薦投稿テーブル（キャッシュ用）
CREATE TABLE recommended_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nevent TEXT NOT NULL,
    author_pubkey TEXT NOT NULL,
    reason TEXT NOT NULL,              -- 'from_new_user' or 'from_isolated_user'
    created_at INTEGER NOT NULL,
    content TEXT,
    updated_at INTEGER NOT NULL
);

-- インデックス作成
CREATE INDEX idx_recommended_users_reason ON recommended_users(reason);
CREATE INDEX idx_recommended_users_updated_at ON recommended_users(updated_at);
CREATE INDEX idx_recommended_posts_reason ON recommended_posts(reason);
CREATE INDEX idx_recommended_posts_updated_at ON recommended_posts(updated_at);
