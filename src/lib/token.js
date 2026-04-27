import crypto from 'node:crypto';

/**
 * 顧客閲覧URL用のトークンを生成する(48文字の16進数)
 */
export function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}
