import { SimplePool, nip19 } from 'nostr-tools';
import { Env, NostrUser, NostrPost, PageRankNode, CollectionMetadata, UserProfile } from '../types';
import { NewUserDetector } from './detector';
import { DatabaseService } from './database';
import { Logger, TimeHelper, Validator } from '../utils/helpers';

/**
 * Nostrデータ収集サービス（Cloudflare Workers版）
 */
export class DataCollector {
  private detector: NewUserDetector;
  private database: DatabaseService;
  private pool: SimplePool;
  private relayUrl: string = 'wss://yabu.me';
  private collectionStartTime: number = 0;

  constructor(env: Env) {
    this.detector = new NewUserDetector(env);
    this.database = new DatabaseService(env);
    this.pool = new SimplePool();
  }

  /**
   * メインのデータ収集処理
   */
  async collectData(): Promise<CollectionMetadata> {
    this.collectionStartTime = TimeHelper.now();
    Logger.info('Starting Nostr data collection', { relay: this.relayUrl });

    try {
      // Step 1: ユーザープロフィールを取得
      Logger.info('Fetching user profiles...');
      const userProfiles = await this.fetchUserProfiles();
      Logger.info(`Found ${userProfiles.length} user profiles`);

      // Step 2: フォローグラフを構築
      Logger.info('Building follow graph...');
      const followGraph = await this.buildFollowGraph();
      Logger.info(`Built follow graph with ${followGraph.size} users`);

      // Step 3: PageRankスコアを計算
      Logger.info('Calculating PageRank scores...');
      const pageRankScores = this.calculatePageRank(followGraph);
      Logger.info(`Calculated PageRank for ${pageRankScores.size} users`);

      // Step 4: 新規ユーザーを特定
      Logger.info('Identifying new users...');
      const newUsers = await this.identifyNewUsers(userProfiles);
      Logger.info(`Found ${newUsers.length} new users`);

      // Step 5: 孤立ユーザーを特定
      Logger.info('Identifying isolated users...');
      const isolatedUsers = this.identifyIsolatedUsers(userProfiles, pageRankScores);
      Logger.info(`Found ${isolatedUsers.length} isolated users`);

      // Step 6: 対象ユーザーの投稿を収集
      Logger.info('Collecting posts from target users...');
      const allTargetUsers = [...newUsers, ...isolatedUsers];
      const posts = await this.collectPostsFromUsers(allTargetUsers);
      Logger.info(`Collected ${posts.length} posts`);

      // Step 7: データを保存
      const metadata = this.createMetadata(userProfiles.length, newUsers.length, isolatedUsers.length);
      await this.database.saveRecommendedUsers(allTargetUsers, metadata);
      await this.database.saveRecommendedPosts(posts, metadata);

      Logger.info('Data collection completed successfully', {
        duration: metadata.collectionDuration,
        totalUsers: allTargetUsers.length,
        totalPosts: posts.length
      });

      return metadata;

    } catch (error) {
      Logger.error('Error during data collection', { error });
      throw error;
    } finally {
      // リレー接続をクリーンアップ
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
        limit: 1000 // 1000プロフィールまで収集
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
          Logger.warn(`Skipping malformed profile for ${event.pubkey.substring(0, 8)}`);
        }
      }

      return profiles;
    } catch (error) {
      Logger.error('Error fetching user profiles', { error });
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

      // ノードを初期化
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

      // フォロー関係を構築
      for (const event of events) {
        const follower = event.pubkey;
        const followingList = event.tags
          .filter(tag => tag[0] === 'p')
          .map(tag => tag[1])
          .filter(pubkey => Validator.isValidPubkey(pubkey)); // 有効なpubkeyのみ

        const followerNode = followGraph.get(follower);
        if (followerNode) {
          followerNode.following = followingList;
        }

        // 逆方向の関係（フォロワー）を追加
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
      Logger.error('Error building follow graph', { error });
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

    // スコアを初期化
    for (const node of nodes) {
      scores.set(node.pubkey, 1.0 / nodeCount);
    }

    // PageRank計算を反復
    for (let i = 0; i < iterations; i++) {
      const newScores = new Map<string, number>();

      for (const node of nodes) {
        let score = (1 - dampingFactor) / nodeCount;

        // フォロワーからの貢献を追加
        for (const followerPubkey of node.followers) {
          const followerNode = graph.get(followerPubkey);
          if (followerNode && followerNode.following.length > 0) {
            const followerScore = scores.get(followerPubkey) || 0;
            score += dampingFactor * (followerScore / followerNode.following.length);
          }
        }

        newScores.set(node.pubkey, score);
      }

      // スコアを更新
      for (const [pubkey, score] of newScores) {
        scores.set(pubkey, score);
      }
    }

    return scores;
  }

  /**
   * 日本語文字を含むユーザーかどうかを判定
   */
  private isJapaneseUser(profile: any): boolean {
    if (!profile) return false;

    const name = profile.name || '';
    const about = profile.about || '';

    return Validator.containsJapanese(name) || Validator.containsJapanese(about);
  }

  /**
   * 新規ユーザーを特定（改良版）
   */
  private async identifyNewUsers(
    profiles: Array<{pubkey: string, profile: any, createdAt: number}>
  ): Promise<NostrUser[]> {
    try {
      // 日本語ユーザーをフィルタリング
      const japaneseUsers = profiles.filter(p => this.isJapaneseUser(p.profile));
      Logger.info(`Found ${japaneseUsers.length} Japanese users out of ${profiles.length} total`);

      if (japaneseUsers.length === 0) {
        return [];
      }

      // 新規ユーザー検出器を使用して判定
      const pubkeys = japaneseUsers.map(p => p.pubkey);
      const detectionResults = await this.detector.checkMultipleUsers(pubkeys);

      // 新規ユーザーのみを抽出
      const newUserCandidates = japaneseUsers.filter(user => {
        const result = detectionResults.get(user.pubkey);
        return result?.isNew === true;
      });

      // 最新順にソートして上位10名を選択
      const newUsers = newUserCandidates
        .sort((a, b) => {
          const resultA = detectionResults.get(a.pubkey);
          const resultB = detectionResults.get(b.pubkey);
          return (resultB?.firstSeenAt || 0) - (resultA?.firstSeenAt || 0);
        })
        .slice(0, 10)
        .map(p => {
          const result = detectionResults.get(p.pubkey);
          return {
            pubkey: nip19.npubEncode(p.pubkey),
            reason: 'new_user' as const,
            createdAt: result?.firstSeenAt ? TimeHelper.toISOString(result.firstSeenAt) : undefined
          };
        });

      Logger.info(`Selected ${newUsers.length} new users for recommendation`);
      return newUsers;
    } catch (error) {
      Logger.error('Error identifying new users', { error });
      return [];
    }
  }

  /**
   * 孤立ユーザーを特定（低いPageRankスコア、日本語ユーザーのみ）
   */
  private identifyIsolatedUsers(
    profiles: Array<{pubkey: string, profile: any, createdAt: number}>,
    pageRankScores: Map<string, number>
  ): NostrUser[] {
    try {
      const usersWithScores = profiles
        .map(p => ({
          pubkey: p.pubkey,
          profile: p.profile,
          score: pageRankScores.get(p.pubkey) || 0
        }))
        .filter(u => u.score > 0 && this.isJapaneseUser(u.profile)) // 日本語ユーザーのみ
        .sort((a, b) => a.score - b.score) // 低いスコア順
        .slice(0, 10); // 上位10名

      const isolatedUsers = usersWithScores.map(u => ({
        pubkey: nip19.npubEncode(u.pubkey),
        reason: 'isolated_user' as const,
        followerCount: Math.floor(u.score * 1000), // スコアを概算フォロワー数に変換
        pageRankScore: u.score
      }));

      Logger.info(`Selected ${isolatedUsers.length} isolated users for recommendation`);
      return isolatedUsers;
    } catch (error) {
      Logger.error('Error identifying isolated users', { error });
      return [];
    }
  }

  /**
   * 対象ユーザーの投稿を収集 (kind: 1)
   */
  private async collectPostsFromUsers(users: NostrUser[]): Promise<NostrPost[]> {
    const posts: NostrPost[] = [];
    const sevenDaysAgo = TimeHelper.daysAgo(7);

    try {
      // npubをhexに変換
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
        limit: 50 // 投稿数を制限
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
              createdAt: TimeHelper.toISOString(event.created_at),
              reason: user.reason === 'new_user' ? 'from_new_user' : 'from_isolated_user',
              content: event.content
            });
          }
        } catch (error) {
          Logger.warn(`Error processing post from ${event.pubkey.substring(0, 8)}`, { error });
        }
      }

      // 作成時間順にソートして制限
      return posts
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 30); // 最大30投稿

    } catch (error) {
      Logger.error('Error collecting posts', { error });
      return [];
    }
  }

  /**
   * コレクションメタデータを作成
   */
  private createMetadata(totalAnalyzed: number, newUsersFound: number, isolatedUsersFound: number): CollectionMetadata {
    const duration = ((TimeHelper.now() - this.collectionStartTime)).toFixed(1);

    return {
      lastUpdated: TimeHelper.toISOString(TimeHelper.now()),
      totalAnalyzed,
      relaySource: this.relayUrl,
      collectionDuration: `${duration}s`,
      newUsersFound,
      isolatedUsersFound
    };
  }

  /**
   * 古いデータのクリーンアップ
   */
  async cleanup(): Promise<void> {
    try {
      await Promise.all([
        this.detector.cleanupOldRegistrations(),
        this.database.cleanupOldData(7) // 7日以上古いデータを削除
      ]);
      Logger.info('Cleanup completed successfully');
    } catch (error) {
      Logger.error('Error during cleanup', { error });
      throw error;
    }
  }
}
