import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { SimplePool, nip19 } from 'nostr-tools';
import {
  UsersData,
  PostsData,
  NostrUser,
  NostrPost,
  PageRankNode,
  CollectionMetadata,
  EnhancedUsersData,
  EnhancedPostsData
} from './types';

/**
 * Real Nostr data collection using nostr-tools
 */
export class DataCollector {
  private dataDir: string;
  private pool: SimplePool;
  private relayUrl: string = 'wss://yabu.me';
  private collectionStartTime: number = 0;

  constructor() {
    this.dataDir = join(process.cwd(), 'data');
    this.pool = new SimplePool();
    this.ensureDataDirectory();
  }

  /**
   * dataディレクトリが存在しない場合は作成
   */
  private ensureDataDirectory(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
      console.log('📁 Created data directory');
    }
  }

  /**
   * Nostrリレーからリアルデータを収集
   */
  async collectData(): Promise<void> {
    this.collectionStartTime = Date.now();
    console.log('🔄 Starting real Nostr data collection from yabu.me...');

    try {
      // Step 1: Connect to relay
      console.log('🔌 Connecting to relay:', this.relayUrl);

      // Step 2: Collect user profiles
      console.log('👥 Fetching user profiles...');
      const userProfiles = await this.fetchUserProfiles();
      console.log(`📊 Found ${userProfiles.length} user profiles`);

      // Step 3: Build follow graph
      console.log('🕸️ Building follow graph...');
      const followGraph = await this.buildFollowGraph();
      console.log(`🔗 Built follow graph with ${followGraph.size} users`);

      // Step 4: Calculate PageRank scores
      console.log('📈 Calculating PageRank scores...');
      const pageRankScores = this.calculatePageRank(followGraph);
      console.log(`🎯 Calculated PageRank for ${pageRankScores.size} users`);

      // Step 5: Identify target users
      console.log('🔍 Identifying new and isolated users...');
      const newUsers = await this.identifyNewUsersImproved(userProfiles);
      const isolatedUsers = this.identifyIsolatedUsers(userProfiles, pageRankScores);

      console.log(`🆕 Found ${newUsers.length} new users`);
      console.log(`🏝️ Found ${isolatedUsers.length} isolated users`);

      // Step 6: Collect posts from target users
      console.log('📝 Collecting posts from target users...');
      const allTargetUsers = [...newUsers, ...isolatedUsers];
      const posts = await this.collectPostsFromUsers(allTargetUsers);
      console.log(`📄 Collected ${posts.length} posts`);

      // Step 7: Save data
      this.saveUsersData(allTargetUsers, userProfiles.length);
      this.savePostsData(posts, userProfiles.length);

      const duration = ((Date.now() - this.collectionStartTime) / 1000).toFixed(1);
      console.log(`✅ Data collection completed successfully in ${duration}s`);
      console.log(`📊 Final stats: ${allTargetUsers.length} users, ${posts.length} posts`);

    } catch (error) {
      console.error('❌ Error during data collection:', error);
      throw error;
    } finally {
      // Always close pool connections
      this.pool.close([this.relayUrl]);
    }
  }

  /**
   * ユーザープロフィール情報を取得 (kind: 0)
   */
  private async fetchUserProfiles(): Promise<Array<{pubkey: string, profile: any, createdAt: number}>> {
    const profiles: Array<{pubkey: string, profile: any, createdAt: number}> = [];

    try {
      const events = await this.pool.querySync([this.relayUrl], {
        kinds: [0], // Profile metadata
        limit: 1000 // Collect up to 1000 profiles for analysis
      });

      for (const event of events) {
        try {
          const profile = JSON.parse(event.content);
          profiles.push({
            pubkey: event.pubkey,
            profile: profile,
            createdAt: event.created_at
          });
        } catch (parseError) {
          // Skip malformed profile data
          console.warn(`⚠️ Skipping malformed profile for ${event.pubkey}`);
        }
      }

      return profiles;
    } catch (error) {
      console.error('❌ Error fetching user profiles:', error);
      return [];
    }
  }

  /**
   * フォローグラフを構築 (kind: 3)
   */
  private async buildFollowGraph(): Promise<Map<string, PageRankNode>> {
    const followGraph = new Map<string, PageRankNode>();

    try {
      const events = await this.pool.querySync([this.relayUrl], {
        kinds: [3], // Contact lists
        limit: 1000
      });

      // Initialize nodes
      for (const event of events) {
        if (!followGraph.has(event.pubkey)) {
          followGraph.set(event.pubkey, {
            pubkey: event.pubkey,
            followers: [],
            following: [],
            score: 1.0
          });
        }
      }

      // Build follow relationships
      for (const event of events) {
        const follower = event.pubkey;
        const followingList = event.tags
          .filter(tag => tag[0] === 'p')
          .map(tag => tag[1]);

        const followerNode = followGraph.get(follower);
        if (followerNode) {
          followerNode.following = followingList;
        }

        // Add reverse relationships (followers)
        for (const following of followingList) {
          if (!followGraph.has(following)) {
            followGraph.set(following, {
              pubkey: following,
              followers: [],
              following: [],
              score: 1.0
            });
          }
          const followingNode = followGraph.get(following);
          if (followingNode && !followingNode.followers.includes(follower)) {
            followingNode.followers.push(follower);
          }
        }
      }

      return followGraph;
    } catch (error) {
      console.error('❌ Error building follow graph:', error);
      return new Map();
    }
  }

  /**
   * PageRankスコアを計算
   */
  private calculatePageRank(
    graph: Map<string, PageRankNode>,
    iterations: number = 10,
    dampingFactor: number = 0.85
  ): Map<string, number> {
    const scores = new Map<string, number>();
    const nodes = Array.from(graph.values());
    const nodeCount = nodes.length;

    if (nodeCount === 0) return scores;

    // Initialize scores
    for (const node of nodes) {
      scores.set(node.pubkey, 1.0 / nodeCount);
    }

    // Iterate PageRank calculation
    for (let i = 0; i < iterations; i++) {
      const newScores = new Map<string, number>();

      for (const node of nodes) {
        let score = (1 - dampingFactor) / nodeCount;

        // Add contributions from followers
        for (const followerPubkey of node.followers) {
          const followerNode = graph.get(followerPubkey);
          if (followerNode && followerNode.following.length > 0) {
            const followerScore = scores.get(followerPubkey) || 0;
            score += dampingFactor * (followerScore / followerNode.following.length);
          }
        }

        newScores.set(node.pubkey, score);
      }

      // Update scores
      for (const [pubkey, score] of newScores) {
        scores.set(pubkey, score);
      }
    }

    return scores;
  }

  /**
   * 日本語文字を含むユーザーかどうかを判定
   * ひらがな（\u3040-\u309F）とカタカナ（\u30A0-\u30FF）を検出
   */
  private isJapaneseUser(profile: any): boolean {
    if (!profile) return false;

    const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF]/;

    // name または about に日本語文字が含まれているかチェック
    const name = profile.name || '';
    const about = profile.about || '';

    return japanesePattern.test(name) || japanesePattern.test(about);
  }

  /**
   * 指定されたユーザーの最初のプロフィール作成日時を取得
   * @param pubkey ユーザーの公開鍵（hex形式）
   * @returns 最初のkind0イベントのcreated_at、見つからない場合はnull
   */
  private async getFirstProfileCreationTime(pubkey: string): Promise<number | null> {
    try {
      console.log(`🔍 Getting first profile creation time for ${pubkey.substring(0, 8)}...`);

      const events = await this.pool.querySync([this.relayUrl], {
        kinds: [0], // Profile metadata
        authors: [pubkey],
        limit: 50 // Get enough events to find the oldest one
      });

      if (events.length === 0) {
        console.log(`⚠️ No profile events found for ${pubkey.substring(0, 8)}`);
        return null;
      }

      // Find the oldest event (minimum created_at)
      const oldestEvent = events.reduce((oldest, current) =>
        current.created_at < oldest.created_at ? current : oldest
      );

      const firstCreatedAt = oldestEvent.created_at;
      console.log(`📅 First profile for ${pubkey.substring(0, 8)}: ${new Date(firstCreatedAt * 1000).toISOString()}`);

      return firstCreatedAt;
    } catch (error) {
      console.error(`❌ Error getting first profile creation time for ${pubkey.substring(0, 8)}:`, error);
      return null;
    }
  }

  /**
   * 複数ユーザーの最初のプロフィール作成日時を効率的に取得
   * @param pubkeys ユーザー公開鍵の配列
   * @returns pubkey -> 最初のcreated_at のマップ
   */
  private async batchGetFirstProfileTimes(pubkeys: string[]): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    const batchSize = 20; // Process 20 users at a time to avoid overwhelming the relay

    console.log(`🔄 Getting first profile times for ${pubkeys.length} users in batches of ${batchSize}...`);

    for (let i = 0; i < pubkeys.length; i += batchSize) {
      const batch = pubkeys.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pubkeys.length / batchSize)} (${batch.length} users)`);

      // Process batch in parallel with rate limiting
      const batchPromises = batch.map(async (pubkey, index) => {
        // Add small delay to avoid overwhelming the relay
        await new Promise(resolve => setTimeout(resolve, index * 100));

        const firstTime = await this.getFirstProfileCreationTime(pubkey);
        if (firstTime !== null) {
          results.set(pubkey, firstTime);
        }
      });

      try {
        await Promise.all(batchPromises);
      } catch (error) {
        console.error(`❌ Error processing batch starting at index ${i}:`, error);
        // Continue with next batch even if current batch fails
      }

      // Add delay between batches to be respectful to the relay
      if (i + batchSize < pubkeys.length) {
        console.log('⏳ Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`✅ Successfully retrieved first profile times for ${results.size}/${pubkeys.length} users`);
    return results;
  }

  /**
   * 改善された新規ユーザー判定ロジック
   * 最初のプロフィール作成日時を基準に判定
   */
  private async identifyNewUsersImproved(
    profiles: Array<{pubkey: string, profile: any, createdAt: number}>
  ): Promise<NostrUser[]> {
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    console.log(`🔍 Identifying new users (created after ${new Date(thirtyDaysAgo * 1000).toISOString()})...`);

    // Filter Japanese users first to reduce API calls
    const japaneseUsers = profiles.filter(p => this.isJapaneseUser(p.profile));
    console.log(`🇯🇵 Found ${japaneseUsers.length} Japanese users out of ${profiles.length} total`);

    if (japaneseUsers.length === 0) {
      console.log('⚠️ No Japanese users found');
      return [];
    }

    // Get first profile creation times for all Japanese users
    const pubkeys = japaneseUsers.map(p => p.pubkey);
    const firstProfileTimes = await this.batchGetFirstProfileTimes(pubkeys);

    // Filter users based on first profile creation time
    const candidateUsers: Array<{pubkey: string, profile: any, firstCreatedAt: number}> = [];

    for (const user of japaneseUsers) {
      const firstCreatedAt = firstProfileTimes.get(user.pubkey);
      if (firstCreatedAt && firstCreatedAt > thirtyDaysAgo) {
        candidateUsers.push({
          pubkey: user.pubkey,
          profile: user.profile,
          firstCreatedAt: firstCreatedAt
        });
      }
    }

    console.log(`🆕 Found ${candidateUsers.length} truly new users (first profile within 30 days)`);

    // Sort by newest first and take top 10
    const newUsers = candidateUsers
      .sort((a, b) => b.firstCreatedAt - a.firstCreatedAt)
      .slice(0, 10)
      .map(p => ({
        pubkey: nip19.npubEncode(p.pubkey),
        reason: 'new_user' as const,
        createdAt: new Date(p.firstCreatedAt * 1000).toISOString()
      }));

    console.log(`✅ Selected ${newUsers.length} new users for recommendation`);
    return newUsers;
  }

  /**
   * 新規ユーザーを特定 (30日以内に作成、日本語文字を含むユーザーのみ)
   * @deprecated Use identifyNewUsersImproved instead
   */
  private identifyNewUsers(
    profiles: Array<{pubkey: string, profile: any, createdAt: number}>
  ): NostrUser[] {
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);

    const newUsers = profiles
      .filter(p => p.createdAt > thirtyDaysAgo && this.isJapaneseUser(p.profile)) // 日本語文字を含むユーザーのみ
      .sort((a, b) => b.createdAt - a.createdAt) // Sort by newest first
      .slice(0, 10) // Take top 10
      .map(p => ({
        pubkey: nip19.npubEncode(p.pubkey),
        reason: 'new_user' as const,
        createdAt: new Date(p.createdAt * 1000).toISOString()
      }));

    return newUsers;
  }

  /**
   * 孤立ユーザーを特定 (低いPageRankスコア、日本語文字を含むユーザーのみ)
   */
  private identifyIsolatedUsers(
    profiles: Array<{pubkey: string, profile: any, createdAt: number}>,
    pageRankScores: Map<string, number>
  ): NostrUser[] {
    const usersWithScores = profiles
      .map(p => ({
        pubkey: p.pubkey,
        profile: p.profile,
        score: pageRankScores.get(p.pubkey) || 0
      }))
      .filter(u => u.score > 0 && this.isJapaneseUser(u.profile)) // 日本語文字を含むユーザーのみ
      .sort((a, b) => a.score - b.score) // Sort by lowest score first
      .slice(0, 10); // Take 10 most isolated

    return usersWithScores.map(u => ({
      pubkey: nip19.npubEncode(u.pubkey),
      reason: 'isolated_user' as const,
      followerCount: Math.floor(u.score * 1000) // Convert score to approximate follower count
    }));
  }

  /**
   * 対象ユーザーの投稿を収集 (kind: 1)
   */
  private async collectPostsFromUsers(users: NostrUser[]): Promise<NostrPost[]> {
    const posts: NostrPost[] = [];
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);

    try {
      // Convert npub back to hex for querying
      const hexPubkeys = users.map(u => {
        try {
          const decoded = nip19.decode(u.pubkey);
          return decoded.type === 'npub' ? decoded.data : null;
        } catch {
          return null;
        }
      }).filter(Boolean) as string[];

      if (hexPubkeys.length === 0) return posts;

      const events = await this.pool.querySync([this.relayUrl], {
        kinds: [1], // Text notes
        authors: hexPubkeys,
        since: sevenDaysAgo,
        limit: 50 // Limit total posts
      });

      for (const event of events) {
        try {
          const authorNpub = nip19.npubEncode(event.pubkey);
          const user = users.find(u => u.pubkey === authorNpub);

          if (user) {
            const nevent = nip19.neventEncode({
              id: event.id,
              relays: [this.relayUrl]
            });

            posts.push({
              nevent: nevent,
              authorPubkey: authorNpub,
              createdAt: new Date(event.created_at * 1000).toISOString(),
              reason: user.reason === 'new_user' ? 'from_new_user' : 'from_isolated_user'
            });
          }
        } catch (error) {
          console.warn(`⚠️ Error processing post from ${event.pubkey}:`, error);
        }
      }

      // Sort by creation time (newest first) and limit
      return posts
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 30); // Limit to 30 total posts

    } catch (error) {
      console.error('❌ Error collecting posts:', error);
      return [];
    }
  }

  /**
   * ユーザーデータをJSONファイルに保存
   */
  private saveUsersData(users: NostrUser[], totalAnalyzed: number): void {
    const duration = ((Date.now() - this.collectionStartTime) / 1000).toFixed(1);

    const usersData: EnhancedUsersData = {
      recommendedUsers: users,
      lastUpdated: new Date().toISOString(),
      metadata: {
        lastUpdated: new Date().toISOString(),
        totalAnalyzed: totalAnalyzed,
        relaySource: this.relayUrl,
        collectionDuration: `${duration}s`,
        newUsersFound: users.filter(u => u.reason === 'new_user').length,
        isolatedUsersFound: users.filter(u => u.reason === 'isolated_user').length
      }
    };

    const filePath = join(this.dataDir, 'users.json');
    writeFileSync(filePath, JSON.stringify(usersData, null, 2), 'utf-8');
    console.log(`💾 Saved ${users.length} users to ${filePath}`);
  }

  /**
   * 投稿データをJSONファイルに保存
   */
  private savePostsData(posts: NostrPost[], totalAnalyzed: number): void {
    const duration = ((Date.now() - this.collectionStartTime) / 1000).toFixed(1);

    const postsData: EnhancedPostsData = {
      recommendedPosts: posts,
      lastUpdated: new Date().toISOString(),
      metadata: {
        lastUpdated: new Date().toISOString(),
        totalAnalyzed: totalAnalyzed,
        relaySource: this.relayUrl,
        collectionDuration: `${duration}s`,
        newUsersFound: posts.filter(p => p.reason === 'from_new_user').length,
        isolatedUsersFound: posts.filter(p => p.reason === 'from_isolated_user').length
      }
    };

    const filePath = join(this.dataDir, 'posts.json');
    writeFileSync(filePath, JSON.stringify(postsData, null, 2), 'utf-8');
    console.log(`💾 Saved ${posts.length} posts to ${filePath}`);
  }
}

/**
 * 新規ユーザー判定 (30日以内)
 */
export function isNewUser(createdAt: number): boolean {
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
  return createdAt > thirtyDaysAgo;
}

/**
 * 孤立ユーザー判定 (PageRankスコアベース)
 */
export function isIsolatedUser(pageRankScore: number, threshold: number = 0.001): boolean {
  return pageRankScore < threshold;
}
