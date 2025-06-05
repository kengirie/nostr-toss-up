import { Env, RecommendedUser, RecommendedPost, NostrUser, NostrPost, CollectionMetadata } from '../types';
import { Logger, TimeHelper } from '../utils/helpers';

/**
 * データベース操作サービス
 * 推薦データの保存・取得を管理
 */
export class DatabaseService {
  private db: D1Database;

  constructor(env: Env) {
    this.db = env.DB;
  }

  /**
   * 推薦ユーザーを保存
   */
  async saveRecommendedUsers(users: NostrUser[], metadata: CollectionMetadata): Promise<void> {
    try {
      // 既存データをクリア
      await this.db.prepare('DELETE FROM recommended_users').run();

      if (users.length === 0) {
        Logger.info('No users to save');
        return;
      }

      // 新しいデータを挿入
      const statements = users.map(user => {
        const createdAt = user.createdAt ? TimeHelper.fromISOString(user.createdAt) : TimeHelper.now();
        return this.db.prepare(
          'INSERT INTO recommended_users (pubkey, reason, created_at, follower_count, page_rank_score, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(
          user.pubkey,
          user.reason,
          createdAt,
          user.followerCount || null,
          user.pageRankScore || null,
          TimeHelper.now()
        );
      });

      await this.db.batch(statements);
      Logger.info(`Saved ${users.length} recommended users to database`);
    } catch (error) {
      Logger.error('Error saving recommended users', { error, count: users.length });
      throw error;
    }
  }

  /**
   * 推薦投稿を保存
   */
  async saveRecommendedPosts(posts: NostrPost[], metadata: CollectionMetadata): Promise<void> {
    try {
      // 既存データをクリア
      await this.db.prepare('DELETE FROM recommended_posts').run();

      if (posts.length === 0) {
        Logger.info('No posts to save');
        return;
      }

      // 新しいデータを挿入
      const statements = posts.map(post => {
        const createdAt = TimeHelper.fromISOString(post.createdAt);
        return this.db.prepare(
          'INSERT INTO recommended_posts (nevent, author_pubkey, reason, created_at, content, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(
          post.nevent,
          post.authorPubkey,
          post.reason,
          createdAt,
          post.content || null,
          TimeHelper.now()
        );
      });

      await this.db.batch(statements);
      Logger.info(`Saved ${posts.length} recommended posts to database`);
    } catch (error) {
      Logger.error('Error saving recommended posts', { error, count: posts.length });
      throw error;
    }
  }

  /**
   * 推薦ユーザーを取得
   */
  async getRecommendedUsers(limit: number = 50): Promise<NostrUser[]> {
    try {
      const results = await this.db
        .prepare('SELECT * FROM recommended_users ORDER BY updated_at DESC LIMIT ?')
        .bind(limit)
        .all<RecommendedUser>();

      const users: NostrUser[] = results.results.map(row => ({
        pubkey: row.pubkey,
        reason: row.reason as 'new_user' | 'isolated_user',
        createdAt: TimeHelper.toISOString(row.created_at),
        followerCount: row.follower_count || undefined,
        pageRankScore: row.page_rank_score || undefined
      }));

      Logger.info(`Retrieved ${users.length} recommended users from database`);
      return users;
    } catch (error) {
      Logger.error('Error getting recommended users', { error });
      throw error;
    }
  }

  /**
   * 推薦投稿を取得
   */
  async getRecommendedPosts(limit: number = 50): Promise<NostrPost[]> {
    try {
      const results = await this.db
        .prepare('SELECT * FROM recommended_posts ORDER BY updated_at DESC LIMIT ?')
        .bind(limit)
        .all<RecommendedPost>();

      const posts: NostrPost[] = results.results.map(row => ({
        nevent: row.nevent,
        authorPubkey: row.author_pubkey,
        reason: row.reason as 'from_new_user' | 'from_isolated_user',
        createdAt: TimeHelper.toISOString(row.created_at),
        content: row.content || undefined
      }));

      Logger.info(`Retrieved ${posts.length} recommended posts from database`);
      return posts;
    } catch (error) {
      Logger.error('Error getting recommended posts', { error });
      throw error;
    }
  }

  /**
   * 理由別の推薦ユーザーを取得
   */
  async getRecommendedUsersByReason(reason: 'new_user' | 'isolated_user', limit: number = 25): Promise<NostrUser[]> {
    try {
      const results = await this.db
        .prepare('SELECT * FROM recommended_users WHERE reason = ? ORDER BY updated_at DESC LIMIT ?')
        .bind(reason, limit)
        .all<RecommendedUser>();

      const users: NostrUser[] = results.results.map(row => ({
        pubkey: row.pubkey,
        reason: row.reason as 'new_user' | 'isolated_user',
        createdAt: TimeHelper.toISOString(row.created_at),
        followerCount: row.follower_count || undefined,
        pageRankScore: row.page_rank_score || undefined
      }));

      Logger.info(`Retrieved ${users.length} ${reason} users from database`);
      return users;
    } catch (error) {
      Logger.error('Error getting users by reason', { error, reason });
      throw error;
    }
  }

  /**
   * 理由別の推薦投稿を取得
   */
  async getRecommendedPostsByReason(reason: 'from_new_user' | 'from_isolated_user', limit: number = 25): Promise<NostrPost[]> {
    try {
      const results = await this.db
        .prepare('SELECT * FROM recommended_posts WHERE reason = ? ORDER BY updated_at DESC LIMIT ?')
        .bind(reason, limit)
        .all<RecommendedPost>();

      const posts: NostrPost[] = results.results.map(row => ({
        nevent: row.nevent,
        authorPubkey: row.author_pubkey,
        reason: row.reason as 'from_new_user' | 'from_isolated_user',
        createdAt: TimeHelper.toISOString(row.created_at),
        content: row.content || undefined
      }));

      Logger.info(`Retrieved ${posts.length} ${reason} posts from database`);
      return posts;
    } catch (error) {
      Logger.error('Error getting posts by reason', { error, reason });
      throw error;
    }
  }

  /**
   * データベースの統計情報を取得
   */
  async getStatistics(): Promise<{
    totalRecommendedUsers: number;
    newUsers: number;
    isolatedUsers: number;
    totalRecommendedPosts: number;
    postsFromNewUsers: number;
    postsFromIsolatedUsers: number;
    lastUpdated: string | null;
  }> {
    try {
      const [
        totalUsersResult,
        newUsersResult,
        isolatedUsersResult,
        totalPostsResult,
        postsFromNewResult,
        postsFromIsolatedResult,
        lastUpdatedResult
      ] = await Promise.all([
        this.db.prepare('SELECT COUNT(*) as count FROM recommended_users').first<{ count: number }>(),
        this.db.prepare('SELECT COUNT(*) as count FROM recommended_users WHERE reason = ?').bind('new_user').first<{ count: number }>(),
        this.db.prepare('SELECT COUNT(*) as count FROM recommended_users WHERE reason = ?').bind('isolated_user').first<{ count: number }>(),
        this.db.prepare('SELECT COUNT(*) as count FROM recommended_posts').first<{ count: number }>(),
        this.db.prepare('SELECT COUNT(*) as count FROM recommended_posts WHERE reason = ?').bind('from_new_user').first<{ count: number }>(),
        this.db.prepare('SELECT COUNT(*) as count FROM recommended_posts WHERE reason = ?').bind('from_isolated_user').first<{ count: number }>(),
        this.db.prepare('SELECT MAX(updated_at) as last_updated FROM recommended_users').first<{ last_updated: number | null }>()
      ]);

      return {
        totalRecommendedUsers: totalUsersResult?.count || 0,
        newUsers: newUsersResult?.count || 0,
        isolatedUsers: isolatedUsersResult?.count || 0,
        totalRecommendedPosts: totalPostsResult?.count || 0,
        postsFromNewUsers: postsFromNewResult?.count || 0,
        postsFromIsolatedUsers: postsFromIsolatedResult?.count || 0,
        lastUpdated: lastUpdatedResult?.last_updated ? TimeHelper.toISOString(lastUpdatedResult.last_updated) : null
      };
    } catch (error) {
      Logger.error('Error getting database statistics', { error });
      throw error;
    }
  }

  /**
   * 古いデータをクリーンアップ
   */
  async cleanupOldData(daysToKeep: number = 7): Promise<void> {
    try {
      const cutoffTime = TimeHelper.daysAgo(daysToKeep);

      const [usersResult, postsResult] = await Promise.all([
        this.db.prepare('DELETE FROM recommended_users WHERE updated_at < ?').bind(cutoffTime).run(),
        this.db.prepare('DELETE FROM recommended_posts WHERE updated_at < ?').bind(cutoffTime).run()
      ]);

      Logger.info(`Cleaned up old data: ${usersResult.meta.changes} users, ${postsResult.meta.changes} posts`);
    } catch (error) {
      Logger.error('Error cleaning up old data', { error });
      throw error;
    }
  }

  /**
   * データベースの健全性チェック
   */
  async healthCheck(): Promise<{
    isHealthy: boolean;
    tables: string[];
    errors: string[];
  }> {
    const errors: string[] = [];
    const tables: string[] = [];

    try {
      // テーブルの存在確認
      const tableResults = await this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user_registrations', 'recommended_users', 'recommended_posts')"
      ).all<{ name: string }>();

      tables.push(...tableResults.results.map(r => r.name));

      // 必要なテーブルが存在するかチェック
      const requiredTables = ['user_registrations', 'recommended_users', 'recommended_posts'];
      for (const table of requiredTables) {
        if (!tables.includes(table)) {
          errors.push(`Missing table: ${table}`);
        }
      }

      // 簡単なクエリテスト
      try {
        await this.db.prepare('SELECT COUNT(*) FROM user_registrations').first();
      } catch (error) {
        errors.push(`Error querying user_registrations: ${error}`);
      }

      try {
        await this.db.prepare('SELECT COUNT(*) FROM recommended_users').first();
      } catch (error) {
        errors.push(`Error querying recommended_users: ${error}`);
      }

      try {
        await this.db.prepare('SELECT COUNT(*) FROM recommended_posts').first();
      } catch (error) {
        errors.push(`Error querying recommended_posts: ${error}`);
      }

    } catch (error) {
      errors.push(`Database connection error: ${error}`);
    }

    const isHealthy = errors.length === 0;
    Logger.info(`Database health check completed: ${isHealthy ? 'healthy' : 'unhealthy'}`, { tables, errors });

    return { isHealthy, tables, errors };
  }
}
