import { Router } from 'express';
import { verifyCsrf } from '../middleware/auth.js';
import { query } from '../../lib/db.js';
import { redeemPoints } from '../../redeem.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const customers = await query(`
      SELECT c.customer_id, c.customer_name, COALESCE(SUM(l.points), 0) AS balance
      FROM customers c
      LEFT JOIN point_ledger l ON c.customer_id = l.customer_id
      GROUP BY c.customer_id, c.customer_name
      ORDER BY c.customer_id
    `);

    res.renderPage('redeem', {
      title: 'ポイント利用',
      currentPath: '/redeem',
      customers: customers.map(c => ({ ...c, balance: parseInt(c.balance, 10) }))
    });
  } catch (e) { next(e); }
});

router.post('/', verifyCsrf, async (req, res) => {
  const { customer_id, points, note } = req.body;
  const redirect = req.body.redirect || '/redeem';

  try {
    const result = await redeemPoints(customer_id, parseInt(points, 10), note || null);
    req.session.flash = { success: `${customer_id} から ${result.redeemed}pt 利用しました（残高: ${result.newBalance}pt）` };
  } catch (e) {
    req.session.flash = { error: e.message };
  }
  res.redirect(redirect);
});

export default router;
