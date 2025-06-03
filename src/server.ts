import express from 'express';
import cors from 'cors';
import usersRouter from './routes/users';
import postsRouter from './routes/posts';

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア設定
app.use(cors());
app.use(express.json());

// ルート設定
app.use('/users', usersRouter);
app.use('/posts', postsRouter);

// ヘルスチェック用エンドポイント
app.get('/', (req, res) => {
  res.json({
    message: 'Nostr Recommendation API',
    version: '1.0.0',
    endpoints: {
      users: '/users',
      posts: '/posts'
    }
  });
});

// 404ハンドラー
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  });
});

// エラーハンドラー
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 Nostr Recommendation API server is running on port ${PORT}`);
  console.log(`📖 API Documentation:`);
  console.log(`   GET http://localhost:${PORT}/users - 推薦ユーザー取得`);
  console.log(`   GET http://localhost:${PORT}/posts - 推薦投稿取得`);
});

export default app;
