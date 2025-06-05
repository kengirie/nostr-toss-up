import { LogEntry } from '../types';

/**
 * ログ出力ユーティリティ
 */
export class Logger {
  static info(message: string, metadata?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      metadata
    };
    console.log(JSON.stringify(entry));
  }

  static warn(message: string, metadata?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      metadata
    };
    console.warn(JSON.stringify(entry));
  }

  static error(message: string, metadata?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      metadata
    };
    console.error(JSON.stringify(entry));
  }
}

/**
 * エラーハンドリングユーティリティ
 */
export class ErrorHandler {
  static handleDatabaseError(error: Error): Response {
    Logger.error('Database error', { error: error.message, stack: error.stack });
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Database operation failed',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  static handleRelayError(error: Error): void {
    Logger.error('Relay connection error', { error: error.message, stack: error.stack });
    // フォールバック処理やリトライロジックをここに実装
  }

  static handleValidationError(message: string): Response {
    Logger.warn('Validation error', { message });
    return new Response(JSON.stringify({
      error: 'Bad Request',
      message,
      timestamp: new Date().toISOString()
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * レスポンス作成ユーティリティ
 */
export class ResponseHelper {
  static json(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  static cors(): Response {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
}

/**
 * バリデーションユーティリティ
 */
export class Validator {
  /**
   * pubkeyの形式を検証（hex形式、64文字）
   */
  static isValidPubkey(pubkey: string): boolean {
    return /^[a-fA-F0-9]{64}$/.test(pubkey);
  }

  /**
   * npubの形式を検証
   */
  static isValidNpub(npub: string): boolean {
    return npub.startsWith('npub1') && npub.length === 63;
  }

  /**
   * 日本語文字を含むかどうかを判定
   */
  static containsJapanese(text: string): boolean {
    const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF]/;
    return japanesePattern.test(text);
  }

  /**
   * Unix timestampの妥当性を検証
   */
  static isValidTimestamp(timestamp: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    const tenYearsAgo = now - (10 * 365 * 24 * 60 * 60);
    const oneYearFromNow = now + (365 * 24 * 60 * 60);

    return timestamp >= tenYearsAgo && timestamp <= oneYearFromNow;
  }
}

/**
 * キャッシュヘルパー
 */
export class CacheHelper {
  /**
   * キャッシュキーを生成
   */
  static generateKey(prefix: string, ...parts: string[]): string {
    return `${prefix}:${parts.join(':')}`;
  }

  /**
   * TTLを計算（秒単位）
   */
  static calculateTTL(hours: number): number {
    return hours * 60 * 60;
  }

  /**
   * キャッシュデータの有効性を確認
   */
  static isExpired(timestamp: number, ttlSeconds: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    return (now - timestamp) > ttlSeconds;
  }
}

/**
 * 時間関連のユーティリティ
 */
export class TimeHelper {
  /**
   * 現在のUnix timestampを取得
   */
  static now(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * 指定日数前のUnix timestampを取得
   */
  static daysAgo(days: number): number {
    return this.now() - (days * 24 * 60 * 60);
  }

  /**
   * Unix timestampをISO文字列に変換
   */
  static toISOString(timestamp: number): string {
    return new Date(timestamp * 1000).toISOString();
  }

  /**
   * ISO文字列をUnix timestampに変換
   */
  static fromISOString(isoString: string): number {
    return Math.floor(new Date(isoString).getTime() / 1000);
  }
}
