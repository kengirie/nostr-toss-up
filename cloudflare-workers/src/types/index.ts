// Cloudflare Workers環境の型定義
export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
}

// 新規ユーザー検出関連の型定義
export interface UserRegistration {
  pubkey: string;
  first_seen_at: number;
  created_at: number;
}

export interface NewUserDetectionResult {
  isNew: boolean;
  firstSeenAt?: number;
}

// Nostr関連の型定義
export interface NostrUser {
  pubkey: string;
  reason: 'new_user' | 'isolated_user';
  createdAt?: string;
  followerCount?: number;
  pageRankScore?: number;
}

export interface NostrPost {
  nevent: string;
  authorPubkey: string;
  createdAt: string;
  reason: 'from_new_user' | 'from_isolated_user';
  content?: string;
}

// API レスポンスの型
export interface UsersResponse {
  users: NostrUser[];
  count: number;
  lastUpdated: string;
  metadata?: CollectionMetadata;
}

export interface PostsResponse {
  posts: NostrPost[];
  count: number;
  lastUpdated: string;
  metadata?: CollectionMetadata;
}

// データベーステーブルの型
export interface RecommendedUser {
  id: number;
  pubkey: string;
  reason: string;
  created_at: number;
  follower_count?: number;
  page_rank_score?: number;
  updated_at: number;
}

export interface RecommendedPost {
  id: number;
  nevent: string;
  author_pubkey: string;
  reason: string;
  created_at: number;
  content?: string;
  updated_at: number;
}

// データ収集用の型
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface UserProfile {
  pubkey: string;
  name?: string;
  about?: string;
  picture?: string;
  created_at: number;
  follower_count: number;
  following_count: number;
}

// PageRank calculation types
export interface PageRankNode {
  pubkey: string;
  followers: string[];
  following: string[];
  score: number;
}

// Collection metadata
export interface CollectionMetadata {
  lastUpdated: string;
  totalAnalyzed: number;
  relaySource: string;
  collectionDuration: string;
  newUsersFound: number;
  isolatedUsersFound: number;
}

// API エラーレスポンス
export interface ErrorResponse {
  error: string;
  message: string;
  timestamp: string;
}

// ログエントリ
export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: any;
}

// キャッシュキー
export enum CacheKeys {
  RECOMMENDED_USERS = 'recommended_users',
  RECOMMENDED_POSTS = 'recommended_posts',
  NEW_USERS_LIST = 'new_users_list',
  COLLECTION_METADATA = 'collection_metadata'
}

// キャッシュTTL（秒）
export enum CacheTTL {
  RECOMMENDED_DATA = 6 * 60 * 60,    // 6時間
  NEW_USERS_LIST = 1 * 60 * 60,      // 1時間
  USER_DETECTION = 30 * 60,          // 30分
  METADATA = 24 * 60 * 60            // 24時間
}
