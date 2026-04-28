import { Router } from 'express';
import { query } from '../../lib/db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const balances = await query('SELECT customer_id, customer_name, tier, balance FROM v_balance ORDER BY customer_id');
    const totalPoints = balances.reduce((sum, b) => sum + parseInt(b.balance, 10), 0);
    const customerCount = balances.length;

    const recentActivity = await query(`
      SELECT l.customer_id, c.customer_name, l.transaction_id, l.points,
             l.type, l.note, l.created_at
      FROM point_ledger l
      JOIN customers c ON c.customer_id = l.customer_id
      ORDER BY l.created_at DESC, l.ledger_id DESC
      LIMIT 10
    `);

    res.renderPage('dashboard', {
      title: 'ダッシュボード',
      currentPath: '/',
      balances: balances.map(b => ({ ...b, balance: parseInt(b.balance, 10) })),
      totalPoints,
      customerCount,
      recentActivity
    });
  } catch (e) { next(e); }
});

export default router;
