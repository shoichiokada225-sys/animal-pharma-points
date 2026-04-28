-- ====================================================================
-- 動物医薬品卸 ポイントシステム スキーマ定義
-- PostgreSQL (Neon) 用
-- ====================================================================

-- 顧客マスタ
CREATE TABLE IF NOT EXISTS customers (
  customer_id   TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  email         TEXT,
  view_token    TEXT NOT NULL UNIQUE,
  tier          TEXT DEFAULT 'general',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 取引(取込済の元データ)
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id   TEXT PRIMARY KEY,
  customer_id      TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  amount           INTEGER NOT NULL,
  category         TEXT,
  imported_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE INDEX IF NOT EXISTS idx_tx_customer
  ON transactions(customer_id, transaction_date);

-- ポイント元帳(全ての加減算履歴)
CREATE TABLE IF NOT EXISTS point_ledger (
  ledger_id       SERIAL PRIMARY KEY,
  customer_id     TEXT NOT NULL,
  transaction_id  TEXT,
  points          INTEGER NOT NULL,
  type            TEXT NOT NULL CHECK(type IN ('EARN','CANCEL','EXPIRE','REDEEM')),
  note            TEXT,
  valid_until     DATE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
CREATE OR REPLACE VIEW v_balance AS
SELECT
  c.customer_id,
  c.customer_name,
  c.view_token,
  c.tier,
  COALESCE(SUM(l.points), 0) AS balance
FROM customers c
LEFT JOIN point_ledger l ON c.customer_id = l.customer_id
GROUP BY c.customer_id, c.customer_name, c.view_token, c.tier
