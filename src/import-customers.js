import 'dotenv/config';
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryOne, withTransaction, closePool } from './lib/db.js';
import { generateToken } from './lib/token.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function importCustomers() {
  const filePath = path.join(__dirname, '..', 'data', 'input', 'customers.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.worksheets[0];

  const headers = {};
  sheet.getRow(1).eachCell((cell, col) => {
    const v = cell.value?.toString().trim();
    if (v) headers[v] = col;
  });

  // 日本語・英語両対応のヘッダー解決
  const col = (ja, en) => headers[ja] || headers[en];
  const cidCol = col('顧客ID', 'customer_id');
  const nameCol = col('顧客名', 'customer_name');
  const emailCol = col('メール', 'email');

  if (!cidCol || !nameCol) {
    throw new Error('必須列が見つかりません: 顧客ID, 顧客名');
  }

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

  console.log(`✅ 顧客マスタ取込完了: 新規 ${added} 件 / 更新 ${updated} 件`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  importCustomers().catch(err => {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  });
}
