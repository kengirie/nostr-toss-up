import { Router, Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { UsersData, UsersResponse } from '../types';

const router = Router();

/**
 * 推薦ユーザー一覧を取得
 * GET /users
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const dataPath = join(process.cwd(), 'data', 'users.json');
    const rawData = readFileSync(dataPath, 'utf-8');
    const usersData: UsersData = JSON.parse(rawData);

    const response: UsersResponse = {
      users: usersData.recommendedUsers.map(user => ({
        pubkey: user.pubkey,
        reason: user.reason
      })),
      count: usersData.recommendedUsers.length,
      lastUpdated: usersData.lastUpdated
    };

    res.json(response);
  } catch (error) {
    console.error('Error reading users data:', error);

    // ファイルが存在しない場合は空のレスポンスを返す
    const emptyResponse: UsersResponse = {
      users: [],
      count: 0,
      lastUpdated: new Date().toISOString()
    };

    res.json(emptyResponse);
  }
});

export default router;
