import { Router } from 'express';
import { verifyCsrf } from '../middleware/auth.js';
import { getDb } from '../../lib/db.js';
import { redeemPoints } from '../../redeem.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const customers = db.prepare(`
    SELECT c.customer_id, c.customer_name, COALESCE(SUM(l.points), 0) AS balance
    FROM customers c
    LEFT JOIN point_ledger l ON c.customer_id = l.customer_id
    GROUP BY c.customer_id
    ORDER BY c.customer_id
  `).all();
  db.close();

  res.renderPage('redeem', {
    title: 'ポイント利用',
    currentPath: '/redeem',
    customers
  });
});

router.post('/', verifyCsrf, (req, res) => {
  const { customer_id, points, note } = req.body;
  const redirect = req.body.redirect || '/redeem';

  try {
    const result = redeemPoints(customer_id, parseInt(points, 10), note || null);
    req.session.flash = { success: `${customer_id} から ${result.redeemed}pt 利用しました（残高: ${result.newBalance}pt）` };
  } catch (e) {
    req.session.flash = { error: e.message };
  }
  res.redirect(redirect);
});

export default router;
