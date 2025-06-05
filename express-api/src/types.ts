// Nostr関連の型定義
export interface NostrUser {
  pubkey: string;
  reason: 'new_user' | 'isolated_user';
  createdAt?: string;
  followerCount?: number;
}

export interface NostrPost {
  nevent: string;
  authorPubkey: string;
  createdAt: string;
  reason: 'from_new_user' | 'from_isolated_user';
}

// JSONファイルの構造
export interface UsersData {
  recommendedUsers: NostrUser[];
  lastUpdated: string;
}

export interface PostsData {
  recommendedPosts: NostrPost[];
  lastUpdated: string;
}

// API レスポンスの型
export interface UsersResponse {
  users: NostrUser[];
  count: number;
  lastUpdated: string;
}

export interface PostsResponse {
  posts: NostrPost[];
  count: number;
  lastUpdated: string;
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

// Enhanced types for nostr-tools integration
export interface NostrUserExtended extends NostrUser {
  name?: string;
  about?: string;
  picture?: string;
  pageRankScore?: number;
  relaySource: string;
  profileCreatedAt: number;
}

export interface NostrPostExtended extends NostrPost {
  content?: string;
  tags?: string[][];
  relaySource: string;
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

// Enhanced data structures with metadata
export interface EnhancedUsersData extends UsersData {
  metadata: CollectionMetadata;
}

export interface EnhancedPostsData extends PostsData {
  metadata: CollectionMetadata;
}
