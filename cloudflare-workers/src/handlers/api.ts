import { nip19 } from 'nostr-tools';
import { Env, UsersResponse, PostsResponse, CacheKeys, CacheTTL } from '../types';
import { DatabaseService } from '../services/database';
import { NewUserDetector } from '../services/detector';
import { Logger, ResponseHelper, ErrorHandler, Validator, TimeHelper } from '../utils/helpers';

/**
 * API リクエストハンドラー
 */
export class ApiHandler {
  private database: DatabaseService;
  private detector: NewUserDetector;
  private cache: KVNamespace;

  constructor(env: Env) {
    this.database = new DatabaseService(env);
    this.detector = new NewUserDetector(env);
    this.cache = env.CACHE;
  }

  /**
   * 推薦ユーザー取得エンドポイント
   * GET /users
   */
  async getUsers(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
      const reason = url.searchParams.get('reason') as 'new_user' | 'isolated_user' | null;

      Logger.info('GET /users request', { limit, reason });

      // キャッシュから確認
      const cacheKey = reason
        ? `${CacheKeys.RECOMMENDED_USERS}:${reason}:${limit}`
        : `${CacheKeys.RECOMMENDED_USERS}:${limit}`;

      const cached = await this.cache.get(cacheKey);
      if (cached) {
        Logger.info('Cache hit for users request');
        return ResponseHelper.json(JSON.parse(cached));
      }

      // データベースから取得
      const users = reason
        ? await this.database.getRecommendedUsersByReason(reason, limit)
        : await this.database.getRecommendedUsers(limit);

      const stats = await this.database.getStatistics();

      const response: UsersResponse = {
        users,
        count: users.length,
        lastUpdated: stats.lastUpdated || TimeHelper.toISOString(TimeHelper.now()),
        metadata: {
          lastUpdated: stats.lastUpdated || TimeHelper.toISOString(TimeHelper.now()),
          totalAnalyzed: stats.totalRecommendedUsers,
          relaySource: 'wss://yabu.me',
          collectionDuration: 'N/A',
          newUsersFound: stats.newUsers,
          isolatedUsersFound: stats.isolatedUsers
        }
      };

      // キャッシュに保存
      await this.cache.put(cacheKey, JSON.stringify(response), {
        expirationTtl: CacheTTL.RECOMMENDED_DATA
      });

      Logger.info(`Returned ${users.length} users`);
      return ResponseHelper.json(response);

    } catch (error) {
      Logger.error('Error in getUsers', { error });
      return ErrorHandler.handleDatabaseError(error as Error);
    }
  }

  /**
   * 推薦投稿取得エンドポイント
   * GET /posts
   */
  async getPosts(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
      const reason = url.searchParams.get('reason') as 'from_new_user' | 'from_isolated_user' | null;

      Logger.info('GET /posts request', { limit, reason });

      // キャッシュから確認
      const cacheKey = reason
        ? `${CacheKeys.RECOMMENDED_POSTS}:${reason}:${limit}`
        : `${CacheKeys.RECOMMENDED_POSTS}:${limit}`;

      const cached = await this.cache.get(cacheKey);
      if (cached) {
        Logger.info('Cache hit for posts request');
        return ResponseHelper.json(JSON.parse(cached));
      }

      // データベースから取得
      const posts = reason
        ? await this.database.getRecommendedPostsByReason(reason, limit)
        : await this.database.getRecommendedPosts(limit);

      const stats = await this.database.getStatistics();

      const response: PostsResponse = {
        posts,
        count: posts.length,
        lastUpdated: stats.lastUpdated || TimeHelper.toISOString(TimeHelper.now()),
        metadata: {
          lastUpdated: stats.lastUpdated || TimeHelper.toISOString(TimeHelper.now()),
          totalAnalyzed: stats.totalRecommendedPosts,
          relaySource: 'wss://yabu.me',
          collectionDuration: 'N/A',
          newUsersFound: stats.postsFromNewUsers,
          isolatedUsersFound: stats.postsFromIsolatedUsers
        }
      };

      // キャッシュに保存
      await this.cache.put(cacheKey, JSON.stringify(response), {
        expirationTtl: CacheTTL.RECOMMENDED_DATA
      });

      Logger.info(`Returned ${posts.length} posts`);
      return ResponseHelper.json(response);

    } catch (error) {
      Logger.error('Error in getPosts', { error });
      return ErrorHandler.handleDatabaseError(error as Error);
    }
  }

  /**
   * ヘルスチェックエンドポイント
   * GET /health
   */
  async getHealth(): Promise<Response> {
    try {
      Logger.info('GET /health request');

      const [dbHealth, detectorStats] = await Promise.all([
        this.database.healthCheck(),
        this.detector.getStatistics()
      ]);

      const health = {
        status: dbHealth.isHealthy ? 'healthy' : 'unhealthy',
        timestamp: TimeHelper.toISOString(TimeHelper.now()),
        database: {
          healthy: dbHealth.isHealthy,
          tables: dbHealth.tables,
          errors: dbHealth.errors
        },
        userDetection: {
          totalUsers: detectorStats.totalUsers,
          newUsersLast30Days: detectorStats.newUsersLast30Days,
          newUsersLast7Days: detectorStats.newUsersLast7Days,
          oldestRegistration: detectorStats.oldestRegistration
            ? TimeHelper.toISOString(detectorStats.oldestRegistration)
            : null,
          newestRegistration: detectorStats.newestRegistration
            ? TimeHelper.toISOString(detectorStats.newestRegistration)
            : null
        },
        recommendations: await this.database.getStatistics()
      };

      const status = dbHealth.isHealthy ? 200 : 503;
      return ResponseHelper.json(health, status);

    } catch (error) {
      Logger.error('Error in getHealth', { error });
      return ResponseHelper.json({
        status: 'error',
        timestamp: TimeHelper.toISOString(TimeHelper.now()),
        error: 'Health check failed'
      }, 503);
    }
  }

  /**
   * 新規ユーザー判定エンドポイント
   * GET /check-user/:pubkey
   */
  async checkUser(request: Request, pubkey: string): Promise<Response> {
    try {
      Logger.info('GET /check-user request', { pubkey: pubkey.substring(0, 8) });

      // pubkeyの形式を検証
      let hexPubkey: string;

      if (Validator.isValidNpub(pubkey)) {
        // npub形式の場合はhexに変換
        try {
          const decoded = nip19.decode(pubkey);
          if (decoded.type !== 'npub') {
            return ErrorHandler.handleValidationError('Invalid npub format');
          }
          hexPubkey = decoded.data;
        } catch {
          return ErrorHandler.handleValidationError('Invalid npub format');
        }
      } else if (Validator.isValidPubkey(pubkey)) {
        // hex形式の場合はそのまま使用
        hexPubkey = pubkey;
      } else {
        return ErrorHandler.handleValidationError('Invalid pubkey format. Use hex or npub format.');
      }

      // 新規ユーザー判定
      const result = await this.detector.isNewUser(hexPubkey);

      const response = {
        pubkey: pubkey,
        isNewUser: result.isNew,
        firstSeenAt: result.firstSeenAt ? TimeHelper.toISOString(result.firstSeenAt) : null,
        checkedAt: TimeHelper.toISOString(TimeHelper.now())
      };

      Logger.info('User check completed', {
        pubkey: pubkey.substring(0, 8),
        isNew: result.isNew
      });

      return ResponseHelper.json(response);

    } catch (error) {
      Logger.error('Error in checkUser', { error, pubkey: pubkey.substring(0, 8) });
      return ErrorHandler.handleDatabaseError(error as Error);
    }
  }

  /**
   * 統計情報取得エンドポイント
   * GET /stats
   */
  async getStats(): Promise<Response> {
    try {
      Logger.info('GET /stats request');

      // キャッシュから確認
      const cacheKey = 'stats';
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        Logger.info('Cache hit for stats request');
        return ResponseHelper.json(JSON.parse(cached));
      }

      const [dbStats, detectorStats] = await Promise.all([
        this.database.getStatistics(),
        this.detector.getStatistics()
      ]);

      const stats = {
        timestamp: TimeHelper.toISOString(TimeHelper.now()),
        userDetection: {
          totalRegisteredUsers: detectorStats.totalUsers,
          newUsersLast30Days: detectorStats.newUsersLast30Days,
          newUsersLast7Days: detectorStats.newUsersLast7Days,
          oldestRegistration: detectorStats.oldestRegistration
            ? TimeHelper.toISOString(detectorStats.oldestRegistration)
            : null,
          newestRegistration: detectorStats.newestRegistration
            ? TimeHelper.toISOString(detectorStats.newestRegistration)
            : null
        },
        recommendations: {
          totalUsers: dbStats.totalRecommendedUsers,
          newUsers: dbStats.newUsers,
          isolatedUsers: dbStats.isolatedUsers,
          totalPosts: dbStats.totalRecommendedPosts,
          postsFromNewUsers: dbStats.postsFromNewUsers,
          postsFromIsolatedUsers: dbStats.postsFromIsolatedUsers,
          lastUpdated: dbStats.lastUpdated
        }
      };

      // キャッシュに保存（短いTTL）
      await this.cache.put(cacheKey, JSON.stringify(stats), {
        expirationTtl: 5 * 60 // 5分
      });

      return ResponseHelper.json(stats);

    } catch (error) {
      Logger.error('Error in getStats', { error });
      return ErrorHandler.handleDatabaseError(error as Error);
    }
  }

  /**
   * キャッシュクリアエンドポイント（管理用）
   * POST /clear-cache
   */
  async clearCache(): Promise<Response> {
    try {
      Logger.info('POST /clear-cache request');

      // 主要なキャッシュキーを削除
      const cacheKeys = [
        CacheKeys.RECOMMENDED_USERS,
        CacheKeys.RECOMMENDED_POSTS,
        CacheKeys.NEW_USERS_LIST,
        CacheKeys.COLLECTION_METADATA,
        'stats'
      ];

      await Promise.all(cacheKeys.map(key => this.cache.delete(key)));

      Logger.info('Cache cleared successfully');
      return ResponseHelper.json({
        message: 'Cache cleared successfully',
        timestamp: TimeHelper.toISOString(TimeHelper.now())
      });

    } catch (error) {
      Logger.error('Error clearing cache', { error });
      return ErrorHandler.handleDatabaseError(error as Error);
    }
  }

  /**
   * ルーティング処理
   */
  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const pathname = url.pathname;

    // CORS対応
    if (method === 'OPTIONS') {
      return ResponseHelper.cors();
    }

    try {
      // ルーティング
      if (method === 'GET') {
        if (pathname === '/users') {
          return this.getUsers(request);
        } else if (pathname === '/posts') {
          return this.getPosts(request);
        } else if (pathname === '/health') {
          return this.getHealth();
        } else if (pathname === '/stats') {
          return this.getStats();
        } else if (pathname.startsWith('/check-user/')) {
          const pubkey = pathname.split('/check-user/')[1];
          if (!pubkey) {
            return ErrorHandler.handleValidationError('Missing pubkey parameter');
          }
          return this.checkUser(request, pubkey);
        }
      } else if (method === 'POST') {
        if (pathname === '/clear-cache') {
          return this.clearCache();
        }
      }

      // 404 Not Found
      return ResponseHelper.json({
        error: 'Not Found',
        message: 'The requested endpoint was not found',
        timestamp: TimeHelper.toISOString(TimeHelper.now())
      }, 404);

    } catch (error) {
      Logger.error('Error in handleRequest', { error, method, pathname });
      return ErrorHandler.handleDatabaseError(error as Error);
    }
  }
}
