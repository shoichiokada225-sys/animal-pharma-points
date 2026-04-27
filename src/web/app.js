import express from 'express';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth, generateCsrf } from './middleware/auth.js';

// ルート
import loginRouter from './routes/login.js';
import dashboardRouter from './routes/dashboard.js';
import customersRouter from './routes/customers.js';
import transactionsRouter from './routes/transactions.js';
import redeemRouter from './routes/redeem.js';
import cancelRouter from './routes/cancel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // ビューエンジン
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // ボディパーサー
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // セッション
  app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 8 * 60 * 60 * 1000, // 8時間
      httpOnly: true,
      sameSite: 'lax'
    }
  }));

  // フラッシュメッセージ
  app.use((req, res, next) => {
    res.locals.flash = req.session.flash || {};
    delete req.session.flash;
    next();
  });

  // ログインは認証不要
  app.use('/login', loginRouter);

  // 認証必須ルート
  app.use(requireAuth);
  app.use(generateCsrf);

  // res.renderPage: ページをレンダリングしてlayoutに埋め込む
  app.use((req, res, next) => {
    res.renderPage = (view, data = {}) => {
      const merged = { ...data, ...res.locals };
      app.render(view, merged, (err, content) => {
        if (err) return next(err);
        res.render('layout', { ...merged, content });
      });
    };
    next();
  });

  app.use('/', dashboardRouter);
  app.use('/customers', customersRouter);
  app.use('/transactions', transactionsRouter);
  app.use('/redeem', redeemRouter);
  app.use('/cancel', cancelRouter);

  // ログアウト
  app.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });

  // エラーハンドラ
  app.use((err, req, res, _next) => {
    console.error('サーバーエラー:', err);
    res.status(500).render('error', {
      title: 'エラー',
      message: 'サーバー内部エラーが発生しました。'
    });
  });

  return app;
}
