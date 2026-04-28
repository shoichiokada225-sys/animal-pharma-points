import 'dotenv/config';
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTransaction, closePool } from './lib/db.js';
import { calculatePoints, loadRules, resolveRate } from './lib/points.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const fileArg = args.find(a => a.startsWith('--file='));
  if (!fileArg) {
    throw new Error('使い方: npm run import:transactions -- --file=transactions_202604.xlsx');
  }
  return fileArg.split('=')[1];
}

function toDateString(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return value?.toString().trim() ?? '';
}

export async function importTransactions(fileName) {
  const filePath = path.join(__dirname, '..', 'data', 'input', fileName);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.worksheets[0];

  const headers = {};
  sheet.getRow(1).eachCell((cell, col) => {
    const v = cell.value?.toString().trim();
    if (v) headers[v] = col;
  });

  for (const r of ['transaction_id', 'customer_id', 'transaction_date', 'amount']) {
    if (!headers[r]) throw new Error(`必須列が見つかりません: ${r}`);
  }

  const rules = loadRules();
  const expiryMonths = rules.expiry_months ?? null;
  console.log(`📋 デフォルト還元率: ${(rules.default_rate * 100).toFixed(3)}% (${rules.default_rate})`);
  if (rules.customer_rates && Object.keys(rules.customer_rates).length > 0) {
    console.log(`📋 顧客別レート: ${Object.keys(rules.customer_rates).length} 件設定あり`);
  }

  let processed = 0, skipped = 0, errors = 0;
  const errorRows = [];

  await withTransaction(async (client) => {
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const txId = row.getCell(headers.transaction_id).value?.toString().trim();
      if (!txId) continue;

      try {
        const cid = row.getCell(headers.customer_id).value?.toString().trim();
        const date = toDateString(row.getCell(headers.transaction_date).value);
        const rawAmount = row.getCell(headers.amount).value;
        const amount = typeof rawAmount === 'number'
          ? Math.floor(rawAmount)
          : parseInt(rawAmount?.toString().replace(/[^0-9-]/g, ''), 10);
        const category = headers.category
          ? row.getCell(headers.category).value?.toString().trim() || null
          : null;

        if (!cid || !date || !Number.isFinite(amount)) {
          throw new Error('必須項目が不足');
        }

        const existingTx = (await client.query(
          'SELECT 1 FROM transactions WHERE transaction_id = $1', [txId]
        )).rows[0];
        if (existingTx) { skipped++; continue; }

        const customerRow = (await client.query(
          'SELECT customer_id, tier FROM customers WHERE customer_id = $1', [cid]
        )).rows[0];
        if (!customerRow) throw new Error(`未登録の顧客ID: ${cid}`);

        const tier = customerRow.tier || null;
        const rate = resolveRate(rules, cid, category, tier);
        const points = calculatePoints(amount, rate);

        let validUntil = null;
        if (expiryMonths) {
          const d = new Date(date);
          d.setMonth(d.getMonth() + expiryMonths);
          validUntil = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }

        await client.query(
          'INSERT INTO transactions (transaction_id, customer_id, transaction_date, amount, category) VALUES ($1, $2, $3, $4, $5)',
          [txId, cid, date, amount, category]
        );
        await client.query(
          'INSERT INTO point_ledger (customer_id, transaction_id, points, type, note, valid_until) VALUES ($1, $2, $3, $4, $5, $6)',
          [cid, txId, points, 'EARN', `購入額 ¥${amount.toLocaleString()} × ${rate}`, validUntil]
        );
        processed++;
      } catch (e) {
        errors++;
        errorRows.push({ row: i, txId, message: e.message });
      }
    }
  });

  console.log(`✅ 処理完了: 付与 ${processed} 件 / 重複スキップ ${skipped} 件 / エラー ${errors} 件`);
  if (errorRows.length > 0) {
    console.log('--- エラー詳細 ---');
    for (const e of errorRows) {
      console.log(`  行${e.row} (${e.txId}): ${e.message}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = parseArgs();
  importTransactions(file).then(() => closePool()).catch(err => {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  });
}
