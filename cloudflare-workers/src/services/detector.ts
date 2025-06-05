import { Env, UserRegistration, NewUserDetectionResult, CacheKeys, CacheTTL } from '../types';
import { Logger } from '../utils/helpers';

/**
 * 新規ユーザー検出サービス
 * pubkeyベースでユーザーの新規性を判定し、データベースに記録する
 */
export class NewUserDetector {
  private db: D1Database;
  private cache: KVNamespace;

  constructor(env: Env) {
    this.db = env.DB;
    this.cache = env.CACHE;
  }

  /**
   * 新規ユーザーかどうかを判定
   * @param pubkey ユーザーの公開鍵（hex形式）
   * @returns 新規ユーザーかどうかと初回検出日時
   */
  async isNewUser(pubkey: string): Promise<NewUserDetectionResult> {
    try {
      // 1. キャッシュから確認
      const cacheKey = `user_detection:${pubkey}`;
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        const result = JSON.parse(cached) as NewUserDetectionResult;
        Logger.info(`Cache hit for user detection: ${pubkey.substring(0, 8)}`);
        return result;
      }

      // 2. データベースから登録情報を検索
      const registration = await this.db
        .prepare('SELECT first_seen_at FROM user_registrations WHERE pubkey = ?')
        .bind(pubkey)
        .first<UserRegistration>();

      let result: NewUserDetectionResult;

      if (!registration) {
        // 3. 未登録の場合は新規ユーザーとして登録
        const now = Math.floor(Date.now() / 1000);
        await this.registerUser(pubkey, now);
        result = { isNew: true, firstSeenAt: now };
        Logger.info(`New user registered: ${pubkey.substring(0, 8)}`);
      } else {
        // 4. 30日以内かどうかを判定
        const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
        const isNew = registration.first_seen_at > thirtyDaysAgo;
        result = { isNew, firstSeenAt: registration.first_seen_at };

        Logger.info(`Existing user checked: ${pubkey.substring(0, 8)}, isNew: ${isNew}`);
      }

      // 5. 結果をキャッシュに保存
      await this.cache.put(cacheKey, JSON.stringify(result), { expirationTtl: CacheTTL.USER_DETECTION });

      return result;
    } catch (error) {
      Logger.error('Error in isNewUser', { pubkey: pubkey.substring(0, 8), error });
      throw error;
    }
  }

  /**
   * ユーザーを登録（初回検出時）
   * @param pubkey ユーザーの公開鍵（hex形式）
   * @param firstSeenAt 初回検出日時（Unix timestamp）
   */
  async registerUser(pubkey: string, firstSeenAt: number): Promise<void> {
    try {
      await this.db
        .prepare('INSERT INTO user_registrations (pubkey, first_seen_at, created_at) VALUES (?, ?, ?)')
        .bind(pubkey, firstSeenAt, Math.floor(Date.now() / 1000))
        .run();

      Logger.info(`User registered successfully: ${pubkey.substring(0, 8)}`);
    } catch (error) {
      Logger.error('Error registering user', { pubkey: pubkey.substring(0, 8), error });
      throw error;
    }
  }

  /**
   * 30日以内の新規ユーザー一覧を取得
   * @param limit 取得件数の上限
   * @returns 新規ユーザーのpubkey配列
   */
  async getNewUsers(limit: number = 50): Promise<string[]> {
    try {
      // キャッシュから確認
      const cacheKey = CacheKeys.NEW_USERS_LIST;
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        const users = JSON.parse(cached) as string[];
        Logger.info(`Cache hit for new users list: ${users.length} users`);
        return users.slice(0, limit);
      }

      // データベースから取得
      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
      const results = await this.db
        .prepare('SELECT pubkey FROM user_registrations WHERE first_seen_at > ? ORDER BY first_seen_at DESC LIMIT ?')
        .bind(thirtyDaysAgo, limit)
        .all<UserRegistration>();

      const users = results.results.map(row => row.pubkey);

      // キャッシュに保存
      await this.cache.put(cacheKey, JSON.stringify(users), { expirationTtl: CacheTTL.NEW_USERS_LIST });

      Logger.info(`Retrieved ${users.length} new users from database`);
      return users;
    } catch (error) {
      Logger.error('Error getting new users', { error });
      throw error;
    }
  }

  /**
   * 複数ユーザーの新規性を一括チェック
   * @param pubkeys ユーザー公開鍵の配列
   * @returns pubkey -> 新規判定結果のマップ
   */
  async checkMultipleUsers(pubkeys: string[]): Promise<Map<string, NewUserDetectionResult>> {
    try {
      const results = new Map<string, NewUserDetectionResult>();

      if (pubkeys.length === 0) return results;

      // バッチでクエリ実行
      const placeholders = pubkeys.map(() => '?').join(',');
      const registrations = await this.db
        .prepare(`SELECT pubkey, first_seen_at FROM user_registrations WHERE pubkey IN (${placeholders})`)
        .bind(...pubkeys)
        .all<UserRegistration>();

      // 結果処理
      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
      const registeredUsers = new Map<string, number>();

      for (const reg of registrations.results) {
        registeredUsers.set(reg.pubkey, reg.first_seen_at);
      }

      // 新規ユーザーを登録するためのバッチ
      const newUsers: Array<{ pubkey: string; timestamp: number }> = [];
      const now = Math.floor(Date.now() / 1000);

      for (const pubkey of pubkeys) {
        const firstSeenAt = registeredUsers.get(pubkey);

        if (firstSeenAt === undefined) {
          // 未登録ユーザー
          results.set(pubkey, { isNew: true, firstSeenAt: now });
          newUsers.push({ pubkey, timestamp: now });
        } else {
          // 既存ユーザー
          const isNew = firstSeenAt > thirtyDaysAgo;
          results.set(pubkey, { isNew, firstSeenAt });
        }
      }

      // 新規ユーザーを一括登録
      if (newUsers.length > 0) {
        await this.batchRegisterUsers(newUsers);
      }

      Logger.info(`Batch checked ${pubkeys.length} users, ${newUsers.length} new registrations`);
      return results;
    } catch (error) {
      Logger.error('Error in batch user check', { count: pubkeys.length, error });
      throw error;
    }
  }

  /**
   * 複数ユーザーを一括登録
   * @param users 登録するユーザー情報の配列
   */
  private async batchRegisterUsers(users: Array<{ pubkey: string; timestamp: number }>): Promise<void> {
    try {
      // トランザクションで一括挿入
      const statements = users.map(user =>
        this.db.prepare('INSERT INTO user_registrations (pubkey, first_seen_at, created_at) VALUES (?, ?, ?)')
          .bind(user.pubkey, user.timestamp, user.timestamp)
      );

      await this.db.batch(statements);
      Logger.info(`Batch registered ${users.length} new users`);
    } catch (error) {
      Logger.error('Error in batch user registration', { count: users.length, error });
      throw error;
    }
  }

  /**
   * 古い登録データをクリーンアップ（60日以上前のデータを削除）
   */
  async cleanupOldRegistrations(): Promise<void> {
    try {
      const sixtyDaysAgo = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);
      const result = await this.db
        .prepare('DELETE FROM user_registrations WHERE first_seen_at < ?')
        .bind(sixtyDaysAgo)
        .run();

      Logger.info(`Cleaned up ${result.meta.changes} old user registrations`);

      // 関連キャッシュをクリア
      await this.cache.delete(CacheKeys.NEW_USERS_LIST);
    } catch (error) {
      Logger.error('Error cleaning up old registrations', { error });
      throw error;
    }
  }

  /**
   * 統計情報を取得
   */
  async getStatistics(): Promise<{
    totalUsers: number;
    newUsersLast30Days: number;
    newUsersLast7Days: number;
    oldestRegistration: number | null;
    newestRegistration: number | null;
  }> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60);
      const sevenDaysAgo = now - (7 * 24 * 60 * 60);

      const [totalResult, newLast30Result, newLast7Result, oldestResult, newestResult] = await Promise.all([
        this.db.prepare('SELECT COUNT(*) as count FROM user_registrations').first<{ count: number }>(),
        this.db.prepare('SELECT COUNT(*) as count FROM user_registrations WHERE first_seen_at > ?').bind(thirtyDaysAgo).first<{ count: number }>(),
        this.db.prepare('SELECT COUNT(*) as count FROM user_registrations WHERE first_seen_at > ?').bind(sevenDaysAgo).first<{ count: number }>(),
        this.db.prepare('SELECT MIN(first_seen_at) as oldest FROM user_registrations').first<{ oldest: number | null }>(),
        this.db.prepare('SELECT MAX(first_seen_at) as newest FROM user_registrations').first<{ newest: number | null }>()
      ]);

      return {
        totalUsers: totalResult?.count || 0,
        newUsersLast30Days: newLast30Result?.count || 0,
        newUsersLast7Days: newLast7Result?.count || 0,
        oldestRegistration: oldestResult?.oldest || null,
        newestRegistration: newestResult?.newest || null
      };
    } catch (error) {
      Logger.error('Error getting statistics', { error });
      throw error;
    }
  }
}
