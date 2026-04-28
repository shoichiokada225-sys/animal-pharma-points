import 'dotenv/config';
import { queryOne, execute, closePool } from './lib/db.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const cidArg = args.find(a => a.startsWith('--customer-id='));
  const ptsArg = args.find(a => a.startsWith('--points='));
  const noteArg = args.find(a => a.startsWith('--note='));

  if (!cidArg || !ptsArg) {
    throw new Error('使い方: npm run redeem -- --customer-id=C0001 --points=100 --note="商品A交換"');
  }

  const customerId = cidArg.split('=')[1];
  const points = parseInt(ptsArg.split('=')[1], 10);
  const note = noteArg ? noteArg.split('=').slice(1).join('=') : null;

  if (!Number.isFinite(points) || points <= 0) {
    throw new Error('--points は1以上の整数を指定してください');
  }
  return { customerId, points, note };
}

export async function redeemPoints(customerId, points, note) {
  if (!Number.isFinite(points) || points <= 0) {
    throw new Error('points は1以上の整数を指定してください');
  }

  const customer = await queryOne(
    'SELECT customer_id, customer_name FROM customers WHERE customer_id = $1', [customerId]
  );
  if (!customer) throw new Error(`未登録の顧客ID: ${customerId}`);

  const row = await queryOne(
    'SELECT COALESCE(SUM(points), 0) AS balance FROM point_ledger WHERE customer_id = $1', [customerId]
  );
  const balance = parseInt(row.balance, 10);

  if (balance < points) {
    throw new Error(`残高不足: 現在 ${balance} pt（要求: ${points} pt）`);
  }

  await execute(
    "INSERT INTO point_ledger (customer_id, transaction_id, points, type, note) VALUES ($1, NULL, $2, 'REDEEM', $3)",
    [customerId, -points, note ?? `ポイント利用 ${points} pt`]
  );

  const newBalance = balance - points;
  console.log(`✅ 利用記録: ${customerId}, -${points}pt, 残高 ${newBalance} pt`);
  return { customerId, redeemed: points, newBalance };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { customerId, points, note } = parseArgs();
  redeemPoints(customerId, points, note).then(() => closePool()).catch(err => {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  });
}
