import 'dotenv/config';
import { importTransactions } from './import-transactions.js';
import { expirePoints } from './expire.js';
import { updateTiers } from './update-tiers.js';
import { exportSummary } from './export-summary.js';
import { exportCustomerViews } from './export-customer-views.js';
import { closePool } from './lib/db.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const fileArg = args.find(a => a.startsWith('--file='));
  if (!fileArg) {
    throw new Error('使い方: npm run monthly -- --file=transactions_202604.xlsx');
  }
  return fileArg.split('=')[1];
}

async function main() {
  const file = parseArgs();

  console.log('=== 月次バッチ開始 ===');
  console.log(`📥 取込ファイル: ${file}`);

  console.log('\n[1/5] 取引取込&ポイント付与');
  await importTransactions(file);

  console.log('\n[2/5] 有効期限切れポイント失効');
  await expirePoints();

  console.log('\n[3/5] ランク更新');
  await updateTiers();

  console.log('\n[4/5] 残高一覧Excel出力');
  await exportSummary();

  console.log('\n[5/5] 顧客向けHTML生成');
  await exportCustomerViews();

  await closePool();
  console.log('\n=== 月次バッチ完了 ===');
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
