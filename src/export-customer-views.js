import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function formatYmdHm(s) {
  const d = new Date(s.replace(' ', 'T') + 'Z');
  // SQLiteのCURRENT_TIMESTAMPはUTC、JSTで表示
  d.setHours(d.getHours() + 9);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

function typeLabel(t) {
  return ({ EARN: '付与', CANCEL: '取消', EXPIRE: '失効', REDEEM: '利用' })[t] ?? t;
}

function tierLabel(t) {
  return ({ general: '一般', silver: 'シルバー', gold: 'ゴールド' })[t] ?? t ?? '一般';
}

function tierColor(t) {
  return ({ general: '#718096', silver: '#718096', gold: '#d69e2e' })[t] ?? '#718096';
}

function renderHtml({ customer, balance, history, generatedAt, tier }) {
  const rows = history.map(h => `
        <tr>
          <td>${escapeHtml(formatYmdHm(h.created_at))}</td>
          <td>${escapeHtml(typeLabel(h.type))}</td>
          <td class="num ${h.points >= 0 ? 'plus' : 'minus'}">${h.points >= 0 ? '+' : ''}${h.points.toLocaleString()} pt</td>
          <td>${escapeHtml(h.note ?? '')}</td>
        </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(customer.customer_name)} 様 ポイント残高</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif;
    background: #f5f7fa; color: #1a202c; line-height: 1.6;
  }
  .container { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 18px; color: #4a5568; margin: 0 0 4px; font-weight: 500; }
  .customer { font-size: 22px; font-weight: 700; margin: 0 0 24px; }
  .balance-card {
    background: linear-gradient(135deg, #4f7fff 0%, #2b5fd1 100%);
    color: white; padding: 32px 24px; border-radius: 12px;
    box-shadow: 0 4px 12px rgba(79, 127, 255, 0.25);
    margin-bottom: 32px;
  }
  .balance-label { font-size: 14px; opacity: 0.9; margin-bottom: 8px; }
  .balance-value { font-size: 40px; font-weight: 700; letter-spacing: -0.02em; }
  .balance-unit { font-size: 18px; margin-left: 4px; opacity: 0.9; }
  h2 { font-size: 16px; color: #2d3748; margin: 0 0 12px; }
  table {
    width: 100%; border-collapse: collapse; background: white;
    border-radius: 8px; overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  th, td {
    padding: 10px 12px; text-align: left; font-size: 14px;
    border-bottom: 1px solid #e2e8f0;
  }
  th { background: #f7fafc; font-weight: 600; color: #4a5568; }
  td.num { text-align: right; font-feature-settings: "tnum"; }
  td.plus { color: #2f855a; font-weight: 600; }
  td.minus { color: #c53030; font-weight: 600; }
  tr:last-child td { border-bottom: none; }
  .empty { text-align: center; padding: 24px; color: #718096; }
  .footer {
    margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;
    font-size: 12px; color: #718096; line-height: 1.7;
  }
  .footer p { margin: 4px 0; }
  .tier-badge {
    display: inline-block; padding: 2px 10px; border-radius: 12px;
    font-size: 13px; font-weight: 600; color: white; margin-left: 8px;
    vertical-align: middle;
  }
  .updated { color: #4a5568; }
  @media (max-width: 480px) {
    body { padding: 16px; }
    .balance-value { font-size: 32px; }
    th, td { padding: 8px; font-size: 13px; }
  }
</style>
</head>
<body>
<div class="container">
  <h1>ポイント残高照会</h1>
  <p class="customer">${escapeHtml(customer.customer_name)} 様
    <span class="tier-badge" style="background:${tierColor(tier)}">${escapeHtml(tierLabel(tier))}</span>
  </p>

  <div class="balance-card">
    <div class="balance-label">現在の保有ポイント</div>
    <div class="balance-value">${balance.toLocaleString()}<span class="balance-unit">pt</span></div>
  </div>

  <h2>ポイント履歴(直近)</h2>
  ${history.length === 0 ? '<div class="empty">履歴はまだありません</div>' : `
  <table>
    <thead>
      <tr>
        <th>日時</th><th>種別</th><th>ポイント</th><th>備考</th>
      </tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>`}

  <div class="footer">
    <p class="updated">最終更新: ${escapeHtml(generatedAt)}</p>
    <p>※ ポイントは購入金額(税抜)の0.1%が付与されます。</p>
    <p>※ このページのURLには個別の認証情報が含まれます。第三者に共有しないでください。</p>
    <p>※ ご不明点は弊社担当者までお問い合わせください。</p>
  </div>
</div>
</body>
</html>`;
}

export async function exportCustomerViews() {
  const db = getDb();

  const customers = db.prepare(`
    SELECT customer_id, customer_name, view_token, tier FROM customers
    ORDER BY customer_id
  `).all();

  const historyStmt = db.prepare(`
    SELECT type, points, note, created_at
    FROM point_ledger
    WHERE customer_id = ?
    ORDER BY created_at DESC, ledger_id DESC
    LIMIT 50
  `);

  const balanceStmt = db.prepare(`
    SELECT COALESCE(SUM(points), 0) AS balance
    FROM point_ledger WHERE customer_id = ?
  `);

  db.close();

  const outDir = path.join(__dirname, '..', 'data', 'output', 'views');
  mkdirSync(outDir, { recursive: true });

  const now = new Date();
  const generatedAt = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  // SQLite再オープン(closeしたので)
  const db2 = getDb();
  let count = 0;
  for (const c of customers) {
    const balance = db2.prepare(`SELECT COALESCE(SUM(points),0) AS b FROM point_ledger WHERE customer_id = ?`).get(c.customer_id).b;
    const history = db2.prepare(`SELECT type, points, note, created_at FROM point_ledger WHERE customer_id = ? ORDER BY created_at DESC, ledger_id DESC LIMIT 50`).all(c.customer_id);

    const html = renderHtml({
      customer: c, balance, history, generatedAt, tier: c.tier
    });
    const fp = path.join(outDir, `${c.view_token}.html`);
    writeFileSync(fp, html, 'utf8');
    count++;
  }
  db2.close();

  // トークン⇔顧客の対応表(社内管理用)
  const indexLines = ['顧客ID,顧客名,トークン,URL(末尾)'];
  for (const c of customers) {
    indexLines.push(`${c.customer_id},${c.customer_name},${c.view_token},/view/${c.view_token}.html`);
  }
  writeFileSync(
    path.join(__dirname, '..', 'data', 'output', '_token_index.csv'),
    '\uFEFF' + indexLines.join('\n'), 'utf8'
  );

  console.log(`✅ 顧客向けHTML生成: ${count} 件 → data/output/views/`);
  console.log(`📄 トークン対応表: data/output/_token_index.csv`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  exportCustomerViews().catch(err => {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  });
}
