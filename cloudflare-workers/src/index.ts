/**
 * Nostr新規ユーザー検出システム - Cloudflare Workers版
 *
 * 機能:
 * - pubkeyベースの新規ユーザー検出（30日以内）
 * - 推薦ユーザー・投稿のAPI提供
 * - 定期的なデータ収集（毎日午前0時UTC）
 * - D1データベースによる永続化
 * - KVストアによるキャッシュ
 */

import { Env } from './types';
import { ApiHandler } from './handlers/api';
import { CronHandler } from './handlers/cron';
import { Logger, ResponseHelper, TimeHelper } from './utils/helpers';

/**
 * Cloudflare Workers エクスポートハンドラー
 */
export default {
  /**
   * HTTP リクエストハンドラー
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = TimeHelper.now();
    const url = new URL(request.url);

    Logger.info('Request received', {
      method: request.method,
      pathname: url.pathname,
      userAgent: request.headers.get('User-Agent')?.substring(0, 100)
    });

    try {
      // ルートパスの場合は基本情報を返す
      if (url.pathname === '/') {
        return ResponseHelper.json({
          name: 'Nostr新規ユーザー検出システム',
          version: '1.0.0',
          description: 'Nostr新規ユーザーと孤立ユーザーの推薦API',
          endpoints: {
            users: '/users - 推薦ユーザー一覧',
            posts: '/posts - 推薦投稿一覧',
            health: '/health - ヘルスチェック',
            stats: '/stats - 統計情報',
            checkUser: '/check-user/{pubkey} - 新規ユーザー判定'
          },
          documentation: 'https://github.com/your-repo/nostr-toss-up',
          timestamp: TimeHelper.toISOString(TimeHelper.now())
        });
      }

      // APIハンドラーでリクエストを処理
      const apiHandler = new ApiHandler(env);
      const response = await apiHandler.handleRequest(request);

      const duration = TimeHelper.now() - startTime;
      Logger.info('Request completed', {
        method: request.method,
        pathname: url.pathname,
        status: response.status,
        duration: `${duration}s`
      });

      return response;

    } catch (error) {
      const duration = TimeHelper.now() - startTime;
      Logger.error('Request failed', {
        method: request.method,
        pathname: url.pathname,
        error,
        duration: `${duration}s`
      });

      return ResponseHelper.json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        timestamp: TimeHelper.toISOString(TimeHelper.now())
      }, 500);
    }
  },

  /**
   * Cron ジョブハンドラー
   */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    Logger.info('Scheduled event triggered', {
      cron: controller.cron,
      scheduledTime: new Date(controller.scheduledTime).toISOString()
    });

    try {
      const cronHandler = new CronHandler(env);

      // waitUntilを使用して、レスポンスを返した後も処理を継続
      ctx.waitUntil(cronHandler.handleCronEvent(controller));

      Logger.info('Scheduled event handler initiated');
    } catch (error) {
      Logger.error('Error in scheduled event handler', { error });
      throw error;
    }
  }
} satisfies ExportedHandler<Env>;
