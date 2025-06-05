import { Env } from '../types';
import { DataCollector } from '../services/collector';
import { Logger, TimeHelper } from '../utils/helpers';

/**
 * Cron ジョブハンドラー
 * 定期的なデータ収集とクリーンアップを実行
 */
export class CronHandler {
  private collector: DataCollector;

  constructor(env: Env) {
    this.collector = new DataCollector(env);
  }

  /**
   * 定期データ収集ジョブ
   * 毎日午前0時（UTC）に実行
   */
  async handleScheduledCollection(): Promise<void> {
    const startTime = TimeHelper.now();
    Logger.info('Starting scheduled data collection job');

    try {
      // データ収集を実行
      const metadata = await this.collector.collectData();

      Logger.info('Scheduled data collection completed successfully', {
        duration: metadata.collectionDuration,
        newUsers: metadata.newUsersFound,
        isolatedUsers: metadata.isolatedUsersFound,
        totalAnalyzed: metadata.totalAnalyzed
      });

      // クリーンアップを実行
      await this.collector.cleanup();

      const totalDuration = TimeHelper.now() - startTime;
      Logger.info('Scheduled job completed successfully', {
        totalDuration: `${totalDuration}s`
      });

    } catch (error) {
      Logger.error('Error in scheduled data collection job', {
        error,
        duration: `${TimeHelper.now() - startTime}s`
      });

      // エラーが発生してもクリーンアップは試行
      try {
        await this.collector.cleanup();
        Logger.info('Cleanup completed despite collection error');
      } catch (cleanupError) {
        Logger.error('Error in cleanup after collection failure', { cleanupError });
      }

      throw error;
    }
  }

  /**
   * Cronイベントのルーティング
   */
  async handleCronEvent(controller: ScheduledController): Promise<void> {
    const cron = controller.cron;
    Logger.info('Cron event received', { cron });

    try {
      switch (cron) {
        case '0 0 * * *': // 毎日午前0時（UTC）
          await this.handleScheduledCollection();
          break;

        default:
          Logger.warn('Unknown cron schedule', { cron });
          break;
      }
    } catch (error) {
      Logger.error('Error handling cron event', { error, cron });
      throw error;
    }
  }
}
