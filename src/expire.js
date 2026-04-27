import { getDb } from './lib/db.js';

/**
 * 有効期限切れポイントの失効バッチ
 * - valid_until < today の EARN レコードを検索
 * - 既に CANCEL/EXPIRE 済みの分を差し引いた残存ポイントを計算
 * - 残存ポイントがあれば type='EXPIRE' で負の値を INSERT
 */
export function expirePoints() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // 有効期限切れかつ未失効の EARN を取得
  const expiredEarns = db.prepare(`
    SELECT e.ledger_id, e.customer_id, e.transaction_id, e.points AS earned
    FROM point_ledger e
    WHERE e.type = 'EARN'
      AND e.valid_until IS NOT NULL
      AND e.valid_until < ?
      AND NOT EXISTS (
        SELECT 1 FROM point_ledger x
        WHERE x.transaction_id = e.transaction_id
          AND x.type = 'EXPIRE'
      )
  `).all(today);

  if (expiredEarns.length === 0) {
    db.close();
    console.log(`✅ 失効対象なし (基準日: ${today})`);
    return { expired: 0, totalPoints: 0 };
  }

  const insertExpire = db.prepare(`
    INSERT INTO point_ledger (customer_id, transaction_id, points, type, note)
    VALUES (?, ?, ?, 'EXPIRE', ?)
  `);

  // CANCEL 済み分を確認する
  const getCancelled = db.prepare(`
    SELECT COALESCE(SUM(ABS(points)), 0) AS cancelled
    FROM point_ledger
    WHERE transaction_id = ? AND type = 'CANCEL'
  `);

  let count = 0;
  let totalPoints = 0;

  const tx = db.transaction(() => {
    for (const earn of expiredEarns) {
      // CANCEL済みの分は差し引く
      const { cancelled } = getCancelled.get(earn.transaction_id);
      const remaining = earn.earned - cancelled;

      if (remaining <= 0) continue;

      insertExpire.run(
        earn.customer_id,
        earn.transaction_id,
        -remaining,
        `有効期限切れ（期限: ${today}）`
      );
      count++;
      totalPoints += remaining;
    }
  });
  tx();

  db.close();
  console.log(`✅ 失効処理完了: ${count} 件, 合計 -${totalPoints} pt (基準日: ${today})`);
  return { expired: count, totalPoints };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    expirePoints();
  } catch (err) {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  }
}
