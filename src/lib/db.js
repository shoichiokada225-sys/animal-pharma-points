import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : false,
});

/**
 * PostgreSQL クエリ実行ヘルパー
 * SQLite互換の薄いラッパー
 */
export async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * 1行取得（なければ null）
 */
export async function queryOne(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

/**
 * INSERT/UPDATE/DELETE の実行（rowCount を返す）
 */
export async function execute(sql, params = []) {
  const result = await pool.query(sql, params);
  return { rowCount: result.rowCount };
}

/**
 * トランザクション実行
 * @param {function} fn - async (client) => {...} クライアントを受け取る関数
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * プール終了
 */
export async function closePool() {
  await pool.end();
}

export { pool };
