import 'dotenv/config';
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, closePool } from './lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

export async function exportSummary() {
  const balances = await query('SELECT customer_id, customer_name, balance FROM v_balance ORDER BY customer_id');

  const ledger = await query(`
    SELECT l.customer_id, c.customer_name, l.transaction_id, l.points,
           l.type, l.note, l.created_at
    FROM point_ledger l
    JOIN customers c ON c.customer_id = l.customer_id
    ORDER BY l.created_at DESC, l.ledger_id DESC
    LIMIT 1000
  `);

  const wb = new ExcelJS.Workbook();
  wb.creator = '動物医薬品卸 ポイントシステム';
  wb.created = new Date();

  const s1 = wb.addWorksheet('残高一覧');
  s1.columns = [
    { header: '顧客ID', key: 'customer_id', width: 12 },
    { header: '顧客名', key: 'customer_name', width: 32 },
    { header: '保有ポイント', key: 'balance', width: 14, style: { numFmt: '#,##0' } },
  ];
  s1.getRow(1).font = { bold: true };
  s1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
  for (const b of balances) s1.addRow({ ...b, balance: parseInt(b.balance, 10) });

  const s2 = wb.addWorksheet('履歴');
  s2.columns = [
    { header: '日時', key: 'created_at', width: 20 },
    { header: '顧客ID', key: 'customer_id', width: 12 },
    { header: '顧客名', key: 'customer_name', width: 32 },
    { header: '取引ID', key: 'transaction_id', width: 20 },
    { header: '種別', key: 'type', width: 10 },
    { header: 'ポイント', key: 'points', width: 12, style: { numFmt: '#,##0' } },
    { header: '備考', key: 'note', width: 40 },
  ];
  s2.getRow(1).font = { bold: true };
  s2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
  for (const r of ledger) s2.addRow(r);

  const outPath = path.join(__dirname, '..', 'data', 'output', `balance_${todayStr()}.xlsx`);
  await wb.xlsx.writeFile(outPath);
  console.log(`✅ 残高一覧Excel出力: ${outPath}`);
  return outPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  exportSummary().then(() => closePool()).catch(err => {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  });
}
