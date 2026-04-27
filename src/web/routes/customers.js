import { Router } from 'express';
import { getDb } from '../../lib/db.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const customers = db.prepare(`
    SELECT c.customer_id, c.customer_name, c.email, c.tier, c.view_token,
           COALESCE(SUM(l.points), 0) AS balance
    FROM customers c
    LEFT JOIN point_ledger l ON c.customer_id = l.customer_id
    GROUP BY c.customer_id
    ORDER BY c.customer_id
  `).all();
  db.close();

  res.renderPage('customers', {
    title: '顧客一覧',
    currentPath: '/customers',
    customers
  });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const customer = db.prepare(`
    SELECT customer_id, customer_name, email, tier, view_token, created_at
    FROM customers WHERE customer_id = ?
  `).get(req.params.id);

  if (!customer) {
    db.close();
    req.session.flash = { error: `顧客 ${req.params.id} が見つかりません` };
    res.redirect('/customers');
    return;
  }

  const balance = db.prepare(
    'SELECT COALESCE(SUM(points), 0) AS balance FROM point_ledger WHERE customer_id = ?'
  ).get(customer.customer_id).balance;

  const page = parseInt(req.query.page || '1', 10);
  const perPage = 20;
  const offset = (page - 1) * perPage;

  const totalRows = db.prepare(
    'SELECT COUNT(*) as cnt FROM point_ledger WHERE customer_id = ?'
  ).get(customer.customer_id).cnt;
  const totalPages = Math.ceil(totalRows / perPage) || 1;

  const history = db.prepare(`
    SELECT ledger_id, transaction_id, points, type, note, valid_until, created_at
    FROM point_ledger WHERE customer_id = ?
    ORDER BY created_at DESC, ledger_id DESC
    LIMIT ? OFFSET ?
  `).all(customer.customer_id, perPage, offset);

  db.close();

  res.renderPage('customer-detail', {
    title: customer.customer_name,
    currentPath: '/customers',
    customer, balance, history, page, totalPages
  });
});

export default router;
