import { getDb } from './lib/db.js';
import { loadRules } from './lib/points.js';

/**
 * 年度(4月〜翌3月)の購入合計額に基づいて顧客ランクを更新する
 */
export function updateTiers() {
  const rules = loadRules();
  const tiers = rules.tiers;

  if (!tiers || Object.keys(tiers).length === 0) {
    console.log('✅ ランク設定なし（rules.json に tiers が未定義）');
    return { updated: 0 };
  }

  // ランクを min_amount 降順でソート（高いランクから判定）
  const sortedTiers = Object.entries(tiers)
    .sort((a, b) => b[1].min_amount - a[1].min_amount);

  // 年度の開始・終了を計算（4月〜翌3月）
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fiscalStart = `${year}-04-01`;
  const fiscalEnd = `${year + 1}-03-31`;

  const db = getDb();

  // 顧客ごとの年度購入合計を取得
  const customerTotals = db.prepare(`
    SELECT customer_id, COALESCE(SUM(amount), 0) AS total_amount
    FROM transactions
    WHERE transaction_date >= ? AND transaction_date <= ?
    GROUP BY customer_id
  `).all(fiscalStart, fiscalEnd);

  // 全顧客を取得（購入がない顧客も一般ランクにする）
  const allCustomers = db.prepare('SELECT customer_id, tier FROM customers').all();
  const totalsMap = new Map(customerTotals.map(r => [r.customer_id, r.total_amount]));

  const updateStmt = db.prepare(`
    UPDATE customers SET tier = ?, updated_at = CURRENT_TIMESTAMP
    WHERE customer_id = ?
  `);

  let updated = 0;

  const tx = db.transaction(() => {
    for (const c of allCustomers) {
      const total = totalsMap.get(c.customer_id) || 0;

      // 高いランクから順に判定
      let newTier = 'general';
      for (const [tierKey, tierDef] of sortedTiers) {
        if (total >= tierDef.min_amount) {
          newTier = tierKey;
          break;
        }
      }

      if (c.tier !== newTier) {
        updateStmt.run(newTier, c.customer_id);
        console.log(`  ${c.customer_id}: ${c.tier || 'general'} → ${newTier} (年度購入額: ¥${total.toLocaleString()})`);
        updated++;
      }
    }
  });
  tx();

  db.close();
  console.log(`✅ ランク更新完了: ${updated} 件変更 (年度: ${fiscalStart} 〜 ${fiscalEnd})`);
  return { updated };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    updateTiers();
  } catch (err) {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  }
}
