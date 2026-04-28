import { Router } from 'express';
import { verifyCsrf } from '../middleware/auth.js';
import { queryOne, execute } from '../../lib/db.js';

const router = Router();

router.post('/', verifyCsrf, async (req, res) => {
  const { transaction_id } = req.body;
  const redirect = req.body.redirect || '/';

  try {
    const earn = await queryOne(
      "SELECT customer_id, points FROM point_ledger WHERE transaction_id = $1 AND type = 'EARN'",
      [transaction_id]
    );
    if (!earn) throw new Error(`付与レコードが見つかりません: ${transaction_id}`);

    const cancelExists = await queryOne(
      "SELECT 1 FROM point_ledger WHERE transaction_id = $1 AND type = 'CANCEL'",
      [transaction_id]
    );
    if (cancelExists) throw new Error(`既に取消済みです: ${transaction_id}`);

    await execute(
      "INSERT INTO point_ledger (customer_id, transaction_id, points, type, note) VALUES ($1, $2, $3, 'CANCEL', $4)",
      [earn.customer_id, transaction_id, -earn.points, `取消（対象取引: ${transaction_id}）`]
    );

    req.session.flash = { success: `取消完了: ${transaction_id}（${earn.customer_id}, ${-earn.points}pt）` };
  } catch (e) {
    req.session.flash = { error: e.message };
  }
  res.redirect(redirect);
});

export default router;
