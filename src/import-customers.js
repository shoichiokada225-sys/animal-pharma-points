import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './lib/db.js';
import { generateToken } from './lib/token.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const filePath = path.join(__dirname, '..', 'data', 'input', 'customers.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.worksheets[0];

  // ヘッダー行から列インデックスを取得
  const headers = {};
  sheet.getRow(1).eachCell((cell, col) => {
    const v = cell.value?.toString().trim();
    if (v) headers[v] = col;
  });

  for (const required of ['customer_id', 'customer_name']) {
    if (!headers[required]) {
      throw new Error(`必須列が見つかりません: ${required}`);
    }
  }

  const db = getDb();
  const findStmt = db.prepare('SELECT view_token FROM customers WHERE customer_id = ?');
  const upsertStmt = db.prepare(`
    INSERT INTO customers (customer_id, customer_name, email, view_token)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(customer_id) DO UPDATE SET
      customer_name = excluded.customer_name,
      email = excluded.email,
      updated_at = CURRENT_TIMESTAMP
  `);

  let added = 0, updated = 0;

  const tx = db.transaction(() => {
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const cid = row.getCell(headers.customer_id).value?.toString().trim();
      if (!cid) continue;

      const name = row.getCell(headers.customer_name).value?.toString().trim();
      const emailCell = headers.email ? row.getCell(headers.email).value : null;
      const email = emailCell ? emailCell.toString().trim() : null;

      const existing = findStmt.get(cid);
      const token = existing?.view_token ?? generateToken();

      upsertStmt.run(cid, name, email, token);
      if (existing) updated++; else added++;
    }
  });
  tx();

  db.close();
  console.log(`✅ 顧客マスタ取込完了: 新規 ${added} 件 / 更新 ${updated} 件`);
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
