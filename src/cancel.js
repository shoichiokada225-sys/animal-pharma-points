import 'dotenv/config';
import { queryOne, execute, closePool } from './lib/db.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const arg = args.find(a => a.startsWith('--transaction-id='));
  if (!arg) {
    throw new Error('使い方: npm run cancel -- --transaction-id=T20260401-001');
  }
  return arg.split('=')[1];
}

export async function cancelTransaction(txId) {
  const earn = await queryOne(
    "SELECT customer_id, points FROM point_ledger WHERE transaction_id = $1 AND type = 'EARN'",
    [txId]
  );
  if (!earn) throw new Error(`付与レコードが見つかりません: ${txId}`);

  const cancelExists = await queryOne(
    "SELECT 1 FROM point_ledger WHERE transaction_id = $1 AND type = 'CANCEL'",
    [txId]
  );
  if (cancelExists) throw new Error(`既に取消済みです: ${txId}`);

  await execute(
    "INSERT INTO point_ledger (customer_id, transaction_id, points, type, note) VALUES ($1, $2, $3, 'CANCEL', $4)",
    [earn.customer_id, txId, -earn.points, `取消（対象取引: ${txId}）`]
  );

  console.log(`✅ 取消完了: ${txId} (顧客 ${earn.customer_id}, ${-earn.points} pt)`);
  return { customerId: earn.customer_id, points: -earn.points };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const txId = parseArgs();
  cancelTransaction(txId).then(() => closePool()).catch(err => {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  });
}
