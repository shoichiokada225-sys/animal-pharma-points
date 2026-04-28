import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, execute, closePool } from './lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function init() {
  // dataディレクトリを作成（ローカル用）
  mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
  mkdirSync(path.join(__dirname, '..', 'data', 'input'), { recursive: true });
  mkdirSync(path.join(__dirname, '..', 'data', 'output'), { recursive: true });
  mkdirSync(path.join(__dirname, '..', 'data', 'output', 'views'), { recursive: true });

  // スキーマ適用（各文を個別実行）
  const schemaPath = path.join(__dirname, '..', 'docs', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    try {
      await execute(stmt);
    } catch (e) {
      // IF NOT EXISTS で既存なら無視
      if (!e.message.includes('already exists')) {
        console.error('  スキーマエラー:', e.message);
      }
    }
  }

  await closePool();
  console.log('✅ DB初期化完了 (Neon PostgreSQL)');
}

init().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
