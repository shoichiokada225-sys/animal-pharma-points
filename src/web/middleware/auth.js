import crypto from 'node:crypto';

// 認証チェック
export function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.redirect('/login');
}

// CSRFトークン生成・検証
export function generateCsrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

export function verifyCsrf(req, res, next) {
  const token = req.body?._csrf;
  if (!token || token !== req.session.csrfToken) {
    res.status(403).send('不正なリクエストです');
    return;
  }
  next();
}
