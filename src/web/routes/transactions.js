import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { verifyCsrf } from '../middleware/auth.js';
import { query, withTransaction } from '../../lib/db.js';
import { generateToken } from '../../lib/token.js';
import { importTransactions } from '../../import-transactions.js';
import { expirePoints } from '../../expire.js';
import { updateTiers } from '../../update-tiers.js';
import { exportSummary } from '../../export-summary.js';
import { exportCustomerViews } from '../../export-customer-views.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_DIR = path.join(__dirname, '..', '..', '..', 'data', 'input');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ext === '.xlsx');
  }
});

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const recentTx = await query(
      'SELECT transaction_id, customer_id, transaction_date, amount, category, imported_at FROM transactions ORDER BY imported_at DESC, transaction_id DESC LIMIT 20'
    );
    res.renderPage('transactions', {
      title: '取引管理',
      currentPath: '/transactions',
      recentTx
    });
  } catch (e) { next(e); }
});

router.post('/import', upload.single('file'), verifyCsrf, async (req, res) => {
  if (!req.file) {
    req.session.flash = { error: 'ファイルが選択されていません' };
    return res.redirect('/transactions');
  }
  try {
    const fileName = req.file.originalname;
    writeFileSync(path.join(INPUT_DIR, fileName), req.file.buffer);
    const logText = await captureLog(() => importTransactions(fileName));
    req.session.flash = { success: `取引取込完了: ${fileName}\n${logText}` };
  } catch (e) {
    req.session.flash = { error: `取込エラー: ${e.message}` };
  }
  res.redirect('/transactions');
});

router.post('/import-customers', upload.single('file'), verifyCsrf, async (req, res) => {
  if (!req.file) {
    req.session.flash = { error: 'ファイルが選択されていません' };
    return res.redirect('/transactions');
  }
  try {
    const filePath = path.join(INPUT_DIR, 'customers.xlsx');
    writeFileSync(filePath, req.file.buffer);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const sheet = wb.worksheets[0];

    const headers = {};
    sheet.getRow(1).eachCell((cell, col) => {
      const v = cell.value?.toString().trim();
      if (v) headers[v] = col;
    });

    const col = (ja, en) => headers[ja] || headers[en];
    const cidCol = col('顧客ID', 'customer_id');
    const nameCol = col('顧客名', 'customer_name');
    const emailCol = col('メール', 'email');

    let added = 0, updated = 0;

    await withTransaction(async (client) => {
      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const cid = row.getCell(cidCol).value?.toString().trim();
        if (!cid) continue;
        const name = row.getCell(nameCol).value?.toString().trim();
        const emailCell = emailCol ? row.getCell(emailCol).value : null;
        const email = emailCell ? emailCell.toString().trim() : null;

        const existing = (await client.query(
          'SELECT view_token FROM customers WHERE customer_id = $1', [cid]
        )).rows[0];
        const token = existing?.view_token ?? generateToken();

        await client.query(`
          INSERT INTO customers (customer_id, customer_name, email, view_token)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT(customer_id) DO UPDATE SET
            customer_name = EXCLUDED.customer_name,
            email = EXCLUDED.email,
            updated_at = CURRENT_TIMESTAMP
        `, [cid, name, email, token]);

        if (existing) updated++; else added++;
      }
    });

    req.session.flash = { success: `顧客マスタ取込完了: 新規 ${added} 件 / 更新 ${updated} 件` };
  } catch (e) {
    req.session.flash = { error: `取込エラー: ${e.message}` };
  }
  res.redirect('/transactions');
});

router.post('/monthly', upload.single('file'), verifyCsrf, async (req, res) => {
  if (!req.file) {
    req.session.flash = { error: 'ファイルが選択されていません' };
    return res.redirect('/transactions');
  }
  try {
    const fileName = req.file.originalname;
    writeFileSync(path.join(INPUT_DIR, fileName), req.file.buffer);

    const logText = await captureLog(async () => {
      await importTransactions(fileName);
      await expirePoints();
      await updateTiers();
      await exportSummary();
      await exportCustomerViews();
    });

    req.session.flash = { success: `月次バッチ完了\n${logText}` };
  } catch (e) {
    req.session.flash = { error: `月次バッチエラー: ${e.message}` };
  }
  res.redirect('/transactions');
});

async function captureLog(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try { await fn(); } finally { console.log = orig; }
  return logs.join('\n');
}

export default router;
