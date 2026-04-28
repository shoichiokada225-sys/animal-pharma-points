import 'dotenv/config';
import { query, withTransaction, closePool } from './lib/db.js';

export async function expirePoints() {
  const today = new Date().toISOString().slice(0, 10);

  const expiredEarns = await query(`
    SELECT e.ledger_id, e.customer_id, e.transaction_id, e.points AS earned
    FROM point_ledger e
    WHERE e.type = 'EARN'
      AND e.valid_until IS NOT NULL
      AND e.valid_until < $1
      AND NOT EXISTS (
        SELECT 1 FROM point_ledger x
        WHERE x.transaction_id = e.transaction_id AND x.type = 'EXPIRE'
      )
  `, [today]);

  if (expiredEarns.length === 0) {
    console.log(`✅ 失効対象なし (基準日: ${today})`);
    return { expired: 0, totalPoints: 0 };
  }

  let count = 0;
  let totalPoints = 0;

  await withTransaction(async (client) => {
    for (const earn of expiredEarns) {
      const cancelRow = (await client.query(
        "SELECT COALESCE(SUM(ABS(points)), 0) AS cancelled FROM point_ledger WHERE transaction_id = $1 AND type = 'CANCEL'",
        [earn.transaction_id]
      )).rows[0];
      const cancelled = parseInt(cancelRow.cancelled, 10);
      const remaining = earn.earned - cancelled;

      if (remaining <= 0) continue;

      await client.query(
        "INSERT INTO point_ledger (customer_id, transaction_id, points, type, note) VALUES ($1, $2, $3, 'EXPIRE', $4)",
        [earn.customer_id, earn.transaction_id, -remaining, `有効期限切れ（期限: ${today}）`]
      );
      count++;
      totalPoints += remaining;
    }
  });

  console.log(`✅ 失効処理完了: ${count} 件, 合計 -${totalPoints} pt (基準日: ${today})`);
  return { expired: count, totalPoints };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  expirePoints().then(() => closePool()).catch(err => {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  });
}
