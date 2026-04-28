import 'dotenv/config';
import { query, withTransaction, closePool } from './lib/db.js';
import { loadRules } from './lib/points.js';

export async function updateTiers() {
  const rules = loadRules();
  const tiers = rules.tiers;

  if (!tiers || Object.keys(tiers).length === 0) {
    console.log('✅ ランク設定なし（rules.json に tiers が未定義）');
    return { updated: 0 };
  }

  const sortedTiers = Object.entries(tiers)
    .sort((a, b) => b[1].min_amount - a[1].min_amount);

  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fiscalStart = `${year}-04-01`;
  const fiscalEnd = `${year + 1}-03-31`;

  const customerTotals = await query(
    'SELECT customer_id, COALESCE(SUM(amount), 0) AS total_amount FROM transactions WHERE transaction_date >= $1 AND transaction_date <= $2 GROUP BY customer_id',
    [fiscalStart, fiscalEnd]
  );
  const allCustomers = await query('SELECT customer_id, tier FROM customers');
  const totalsMap = new Map(customerTotals.map(r => [r.customer_id, parseInt(r.total_amount, 10)]));

  let updated = 0;

  await withTransaction(async (client) => {
    for (const c of allCustomers) {
      const total = totalsMap.get(c.customer_id) || 0;
      let newTier = 'general';
      for (const [tierKey, tierDef] of sortedTiers) {
        if (total >= tierDef.min_amount) { newTier = tierKey; break; }
      }
      if (c.tier !== newTier) {
        await client.query(
          'UPDATE customers SET tier = $1, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $2',
          [newTier, c.customer_id]
        );
        console.log(`  ${c.customer_id}: ${c.tier || 'general'} → ${newTier} (年度購入額: ¥${total.toLocaleString()})`);
        updated++;
      }
    }
  });

  console.log(`✅ ランク更新完了: ${updated} 件変更 (年度: ${fiscalStart} 〜 ${fiscalEnd})`);
  return { updated };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  updateTiers().then(() => closePool()).catch(err => {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  });
}
