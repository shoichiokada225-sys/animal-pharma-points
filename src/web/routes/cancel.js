import { Router } from 'express';
import { verifyCsrf } from '../middleware/auth.js';
import { getDb } from '../../lib/db.js';

const router = Router();

// CANCEL 実行
router.post('/', verifyCsrf, (req, res) => {
  const { transaction_id } = req.body;
  const redirect = req.body.redirect || '/';

  try {
    const db = getDb();

    const earn = db.prepare(`
      SELECT customer_id, points FROM point_ledger
      WHERE transaction_id = ? AND type = 'EARN'
    `).get(transaction_id);

    if (!earn) {
      db.close();
      throw new Error(`付与レコードが見つかりません: ${transaction_id}`);
    }

    const cancelExists = db.prepare(`
      SELECT 1 FROM point_ledger
      WHERE transaction_id = ? AND type = 'CANCEL'
    `).get(transaction_id);

    if (cancelExists) {
      db.close();
      throw new Error(`既に取消済みです: ${transaction_id}`);
    }

    db.prepare(`
      INSERT INTO point_ledger (customer_id, transaction_id, points, type, note)
      VALUES (?, ?, ?, 'CANCEL', ?)
    `).run(earn.customer_id, transaction_id, -earn.points, `取消（対象取引: ${transaction_id}）`);

    db.close();
    req.session.flash = { success: `取消完了: ${transaction_id}（${earn.customer_id}, ${-earn.points}pt）` };
  } catch (e) {
    req.session.flash = { error: e.message };
  }
  res.redirect(redirect);
});

export default router;
