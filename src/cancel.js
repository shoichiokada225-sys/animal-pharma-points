import { getDb } from './lib/db.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const arg = args.find(a => a.startsWith('--transaction-id='));
  if (!arg) {
    throw new Error('使い方: npm run cancel -- --transaction-id=T20260401-001');
  }
  return arg.split('=')[1];
}

function main() {
  const txId = parseArgs();
  const db = getDb();

  const earn = db.prepare(`
    SELECT customer_id, points FROM point_ledger
    WHERE transaction_id = ? AND type = 'EARN'
  `).get(txId);

  if (!earn) {
    throw new Error(`付与レコードが見つかりません: ${txId}`);
  }

  const cancelExists = db.prepare(`
    SELECT 1 FROM point_ledger
    WHERE transaction_id = ? AND type = 'CANCEL'
  `).get(txId);

  if (cancelExists) {
    throw new Error(`既に取消済みです: ${txId}`);
  }

  const insertCancel = db.prepare(`
    INSERT INTO point_ledger (customer_id, transaction_id, points, type, note)
    VALUES (?, ?, ?, 'CANCEL', ?)
  `);

  insertCancel.run(
    earn.customer_id,
    txId,
    -earn.points,
    `取消(対象取引: ${txId})`
  );

  db.close();
  console.log(`✅ 取消完了: ${txId} (顧客 ${earn.customer_id}, ${-earn.points} pt)`);
}

try {
  main();
} catch (err) {
  console.error('❌ エラー:', err.message);
  process.exit(1);
}
