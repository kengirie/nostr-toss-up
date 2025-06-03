import { Router, Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PostsData, PostsResponse } from '../types';

const router = Router();

/**
 * 推薦投稿一覧を取得
 * GET /posts
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const dataPath = join(process.cwd(), 'data', 'posts.json');
    const rawData = readFileSync(dataPath, 'utf-8');
    const postsData: PostsData = JSON.parse(rawData);

    const response: PostsResponse = {
      posts: postsData.recommendedPosts.map(post => ({
        nevent: post.nevent,
        authorPubkey: post.authorPubkey,
        createdAt: post.createdAt,
        reason: post.reason
      })),
      count: postsData.recommendedPosts.length,
      lastUpdated: postsData.lastUpdated
    };

    res.json(response);
  } catch (error) {
    console.error('Error reading posts data:', error);

    // ファイルが存在しない場合は空のレスポンスを返す
    const emptyResponse: PostsResponse = {
      posts: [],
      count: 0,
      lastUpdated: new Date().toISOString()
    };

    res.json(emptyResponse);
  }
});

export default router;
