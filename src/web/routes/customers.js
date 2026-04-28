import { Router } from 'express';
import { query, queryOne } from '../../lib/db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const customers = await query(`
      SELECT c.customer_id, c.customer_name, c.email, c.tier, c.view_token,
             COALESCE(SUM(l.points), 0) AS balance
      FROM customers c
      LEFT JOIN point_ledger l ON c.customer_id = l.customer_id
      GROUP BY c.customer_id, c.customer_name, c.email, c.tier, c.view_token
      ORDER BY c.customer_id
    `);

    res.renderPage('customers', {
      title: '顧客一覧',
      currentPath: '/customers',
      customers: customers.map(c => ({ ...c, balance: parseInt(c.balance, 10) }))
    });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const customer = await queryOne(
      'SELECT customer_id, customer_name, email, tier, view_token, created_at FROM customers WHERE customer_id = $1',
      [req.params.id]
    );
    if (!customer) {
      req.session.flash = { error: `顧客 ${req.params.id} が見つかりません` };
      return res.redirect('/customers');
    }

    const balRow = await queryOne(
      'SELECT COALESCE(SUM(points), 0) AS balance FROM point_ledger WHERE customer_id = $1',
      [customer.customer_id]
    );
    const balance = parseInt(balRow.balance, 10);

    const page = parseInt(req.query.page || '1', 10);
    const perPage = 20;
    const offset = (page - 1) * perPage;

    const countRow = await queryOne(
      'SELECT COUNT(*) as cnt FROM point_ledger WHERE customer_id = $1',
      [customer.customer_id]
    );
    const totalPages = Math.ceil(parseInt(countRow.cnt, 10) / perPage) || 1;

    const history = await query(
      'SELECT ledger_id, transaction_id, points, type, note, valid_until, created_at FROM point_ledger WHERE customer_id = $1 ORDER BY created_at DESC, ledger_id DESC LIMIT $2 OFFSET $3',
      [customer.customer_id, perPage, offset]
    );

    res.renderPage('customer-detail', {
      title: customer.customer_name,
      currentPath: '/customers',
      customer, balance, history, page, totalPages
    });
  } catch (e) { next(e); }
});

export default router;
