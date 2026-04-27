import { getDb } from './lib/db.js';

function parseArgs() {
  const args = process.argv.slice(2);

  const cidArg = args.find(a => a.startsWith('--customer-id='));
  const ptsArg = args.find(a => a.startsWith('--points='));
  const noteArg = args.find(a => a.startsWith('--note='));

  if (!cidArg || !ptsArg) {
    throw new Error(
      '使い方: npm run redeem -- --customer-id=C0001 --points=100 --note="商品A交換"'
    );
  }

  const customerId = cidArg.split('=')[1];
  const points = parseInt(ptsArg.split('=')[1], 10);
  const note = noteArg ? noteArg.split('=').slice(1).join('=') : null;

  if (!Number.isFinite(points) || points <= 0) {
    throw new Error('--points は1以上の整数を指定してください');
  }

  return { customerId, points, note };
}

export function redeemPoints(customerId, points, note) {
  if (!Number.isFinite(points) || points <= 0) {
    throw new Error('points は1以上の整数を指定してください');
  }

  const db = getDb();

  // 顧客存在チェック
  const customer = db.prepare(
    'SELECT customer_id, customer_name FROM customers WHERE customer_id = ?'
  ).get(customerId);

  if (!customer) {
    db.close();
    throw new Error(`未登録の顧客ID: ${customerId}`);
  }

  // 現在残高を取得
  const { balance } = db.prepare(
    'SELECT COALESCE(SUM(points), 0) AS balance FROM point_ledger WHERE customer_id = ?'
  ).get(customerId);

  if (balance < points) {
    db.close();
    throw new Error(`残高不足: 現在 ${balance} pt（要求: ${points} pt）`);
  }

  // 元帳に REDEEM を記録（負の値）
  db.prepare(`
    INSERT INTO point_ledger (customer_id, transaction_id, points, type, note)
    VALUES (?, NULL, ?, 'REDEEM', ?)
  `).run(customerId, -points, note ?? `ポイント利用 ${points} pt`);

  const newBalance = balance - points;
  db.close();

  console.log(`✅ 利用記録: ${customerId}, -${points}pt, 残高 ${newBalance} pt`);
  return { customerId, redeemed: points, newBalance };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { customerId, points, note } = parseArgs();
    redeemPoints(customerId, points, note);
  } catch (err) {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  }
}
