import { Router } from 'express';
import bcrypt from 'bcrypt';

const router = Router();

router.get('/', (req, res) => {
  if (req.session.authenticated) {
    return res.redirect('/');
  }
  res.render('login', { title: 'ログイン', error: null });
});

router.post('/', async (req, res) => {
  const { password } = req.body;
  const hash = process.env.APP_PASSWORD_HASH;
  console.log('LOGIN DEBUG: password=', JSON.stringify(password), 'hash=', hash?.substring(0, 15), 'hash_len=', hash?.length);

  if (!hash) {
    res.render('login', { title: 'ログイン', error: 'サーバー設定エラー: APP_PASSWORD_HASH が未設定です' });
    return;
  }

  try {
    const match = await bcrypt.compare(password || '', hash);
    if (match) {
      req.session.authenticated = true;
      req.session.save(() => {
        res.redirect('/');
      });
    } else {
      res.render('login', { title: 'ログイン', error: 'パスワードが正しくありません' });
    }
  } catch (e) {
    res.render('login', { title: 'ログイン', error: 'ログイン処理でエラーが発生しました' });
  }
});

export default router;
