-- ====================================================================
-- 動物医薬品卸 ポイントシステム スキーマ定義
-- SQLite3 用
-- ====================================================================

-- 顧客マスタ
CREATE TABLE IF NOT EXISTS customers (
  customer_id   TEXT PRIMARY KEY,            -- 例: C0001
  customer_name TEXT NOT NULL,
  email         TEXT,
  view_token    TEXT NOT NULL UNIQUE,        -- 顧客閲覧URL用トークン(32文字以上)
  tier          TEXT DEFAULT 'general',      -- ランク(general/silver/gold)
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 取引(取込済の元データ)
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id   TEXT PRIMARY KEY,         -- 販売管理側のID
  customer_id      TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  amount           INTEGER NOT NULL,         -- 円(税抜)
  category         TEXT,                     -- 商品分類(任意、レート解決に使用)
  imported_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE INDEX IF NOT EXISTS idx_tx_customer
  ON transactions(customer_id, transaction_date);

-- ポイント元帳(全ての加減算履歴)
-- type:
--   'EARN'   購入による付与
--   'CANCEL' 返品・取消による減算
--   'EXPIRE' 有効期限切れ(将来用、MVPでは未使用)
--   'REDEEM' ポイント利用(将来用、MVPでは未使用)
CREATE TABLE IF NOT EXISTS point_ledger (
  ledger_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id     TEXT NOT NULL,
  transaction_id  TEXT,                      -- EARN/CANCELでは取引IDを紐付け
  points          INTEGER NOT NULL,          -- 正負どちらも可
  type            TEXT NOT NULL CHECK(type IN ('EARN','CANCEL','EXPIRE','REDEEM')),
  note            TEXT,
  valid_until     DATE,                      -- ポイント有効期限(EARN時に設定、NULLは無期限)
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_customer
  ON point_ledger(customer_id, created_at);

-- 同一取引に対する二重付与/二重取消の防止
CREATE UNIQUE INDEX IF NOT EXISTS uk_ledger_earn
  ON point_ledger(transaction_id) WHERE type = 'EARN';

CREATE UNIQUE INDEX IF NOT EXISTS uk_ledger_cancel
  ON point_ledger(transaction_id) WHERE type = 'CANCEL';

-- 残高ビュー(顧客ごとの現在残高)
CREATE VIEW IF NOT EXISTS v_balance AS
SELECT
  c.customer_id,
  c.customer_name,
  c.view_token,
  c.tier,
  COALESCE(SUM(l.points), 0) AS balance
FROM customers c
LEFT JOIN point_ledger l ON c.customer_id = l.customer_id
GROUP BY c.customer_id, c.customer_name, c.view_token, c.tier;
