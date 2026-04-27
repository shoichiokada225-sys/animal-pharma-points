import { Router } from 'express';
import { getDb } from '../../lib/db.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();

  const balances = db.prepare(`
    SELECT customer_id, customer_name, tier, balance
    FROM v_balance
    ORDER BY customer_id
  `).all();

  const totalPoints = balances.reduce((sum, b) => sum + b.balance, 0);
  const customerCount = balances.length;

  const recentActivity = db.prepare(`
    SELECT l.customer_id, c.customer_name, l.transaction_id, l.points,
           l.type, l.note, l.created_at
    FROM point_ledger l
    JOIN customers c ON c.customer_id = l.customer_id
    ORDER BY l.created_at DESC, l.ledger_id DESC
    LIMIT 10
  `).all();

  db.close();

  res.renderPage('dashboard', {
    title: 'ダッシュボード',
    currentPath: '/',
    balances,
    totalPoints,
    customerCount,
    recentActivity
  });
});

export default router;
