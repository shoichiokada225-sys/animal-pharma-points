import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function hasColumn(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === column);
}

function migrate(db) {
  // valid_until 列追加 (機能3: 有効期限)
  if (!hasColumn(db, 'point_ledger', 'valid_until')) {
    db.exec('ALTER TABLE point_ledger ADD COLUMN valid_until DATE');
    console.log('  マイグレーション: point_ledger.valid_until 列を追加');
  }
  // category 列追加 (機能4: 商品分類別レート)
  if (!hasColumn(db, 'transactions', 'category')) {
    db.exec('ALTER TABLE transactions ADD COLUMN category TEXT');
    console.log('  マイグレーション: transactions.category 列を追加');
  }
  // tier 列追加 (機能5: ランク制)
  if (!hasColumn(db, 'customers', 'tier')) {
    db.exec("ALTER TABLE customers ADD COLUMN tier TEXT DEFAULT 'general'");
    console.log('  マイグレーション: customers.tier 列を追加');
  }

  // v_balance ビューを再作成（tier列を含むバージョンに更新）
  const viewCols = db.prepare("PRAGMA table_info(v_balance)").all();
  if (!viewCols.some(c => c.name === 'tier')) {
    db.exec('DROP VIEW IF EXISTS v_balance');
    db.exec(`
      CREATE VIEW v_balance AS
      SELECT
        c.customer_id, c.customer_name, c.view_token, c.tier,
        COALESCE(SUM(l.points), 0) AS balance
      FROM customers c
      LEFT JOIN point_ledger l ON c.customer_id = l.customer_id
      GROUP BY c.customer_id, c.customer_name, c.view_token, c.tier
    `);
    console.log('  マイグレーション: v_balance ビューを再作成(tier列追加)');
  }
}

function init() {
  // dataディレクトリを作成
  mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
  mkdirSync(path.join(__dirname, '..', 'data', 'input'), { recursive: true });
  mkdirSync(path.join(__dirname, '..', 'data', 'output'), { recursive: true });
  mkdirSync(path.join(__dirname, '..', 'data', 'output', 'views'), { recursive: true });

  // スキーマ適用
  const schemaPath = path.join(__dirname, '..', 'docs', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');

  const db = getDb();
  db.exec(schema);

  // 既存DBへのマイグレーション
  migrate(db);

  db.close();

  console.log('✅ DB初期化完了: data/points.db');
}

init();
