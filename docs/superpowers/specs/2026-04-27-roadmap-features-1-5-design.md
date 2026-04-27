# 拡張ロードマップ 機能1〜5 設計書

## 概要

動物医薬品卸ポイントシステムの5つの拡張機能を、元帳(ledger)方式・べき等性・設定外部化の既存原則を維持しつつ追加する。

---

## 機能1: REDEEM（ポイント利用）

### 目的
顧客が貯めたポイントを利用（消費）できるようにする。

### 設計
- `point_ledger` に `type='REDEEM'`、`points` に負の値を INSERT
- 残高不足時はエラーで終了（部分利用は不可）
- `transaction_id` は NULL（取引に紐付かない独立操作）

### CLI
```bash
npm run redeem -- --customer-id=C0001 --points=100 --note="商品A交換"
```

### 出力
- 成功: `✅ 利用記録: C0001, -100pt, 残高 ○○ pt`
- 失敗: `❌ 残高不足: 現在 ○○ pt（要求: 100 pt）`

### ファイル変更
- 新規: `src/redeem.js`
- 変更: `package.json`（scripts に "redeem" 追加）

---

## 機能2: 顧客別レート

### 目的
特定の顧客に対して、デフォルトと異なる還元率を設定可能にする。

### 設計
- `config/rules.json` に `customer_rates` セクションを追加
- 取引取込時、`customer_id` が `customer_rates` にあればその率を優先
- なければ `default_rate` を使用

### rules.json 変更後
```json
{
  "default_rate": 0.001,
  "customer_rates": {},
  "rounding": "floor",
  "_comment": "..."
}
```

### ファイル変更
- 変更: `config/rules.json`
- 変更: `src/import-transactions.js`（レート解決ロジック追加）
- 変更: `src/lib/points.js`（`getRate()` ヘルパー追加）

---

## 機能3: ポイント有効期限と失効バッチ

### 目的
付与から一定期間経過したポイントを自動失効させる。

### 設計
- `point_ledger` に `valid_until DATE` 列を追加
- EARN レコード作成時、`valid_until = 付与日 + 2年` を設定
- 失効バッチ: `valid_until < today` かつ未失効の EARN を検索し、残存ポイント分を `type='EXPIRE'` で負の値を INSERT
- 失効はEARN単位（各付与行ごとに個別に失効判定）
- CANCEL済みの付与は失効対象外

### 有効期間設定
- `config/rules.json` に `"expiry_months": 24` を追加
- デフォルト24ヶ月（2年）

### CLI
```bash
npm run expire           # 失効バッチ実行
```

### 月次バッチへの組込
`monthly.js` の処理フローに失効バッチを追加（取込後、エクスポート前）。

### スキーマ変更
```sql
ALTER TABLE point_ledger ADD COLUMN valid_until DATE;
```

### ファイル変更
- 新規: `src/expire.js`
- 変更: `docs/schema.sql`（valid_until 列追加）
- 変更: `src/init.js`（マイグレーション対応）
- 変更: `src/import-transactions.js`（valid_until 設定）
- 変更: `src/monthly.js`（失効ステップ追加）
- 変更: `config/rules.json`（expiry_months 追加）
- 変更: `package.json`（scripts に "expire" 追加）

---

## 機能4: 商品分類別レート

### 目的
取引の商品分類に応じて異なる還元率を適用する。

### 設計
- 取引 Excel に `category` 列を追加（任意列、未指定時はデフォルト）
- `transactions` テーブルに `category TEXT` 列を追加
- `config/rules.json` に `category_rates` セクションを追加
- レート解決の優先順位: **顧客別 > 商品分類別 > デフォルト**

### rules.json 変更後
```json
{
  "default_rate": 0.001,
  "customer_rates": {},
  "category_rates": {},
  "rounding": "floor",
  "expiry_months": 24
}
```

### カテゴリ例
```json
"category_rates": {
  "antibiotic": 0.0015,
  "vaccine": 0.002
}
```

### スキーマ変更
```sql
ALTER TABLE transactions ADD COLUMN category TEXT;
```

### ファイル変更
- 変更: `docs/schema.sql`（category 列追加）
- 変更: `src/init.js`（マイグレーション）
- 変更: `src/import-transactions.js`（category 読込、レート解決に反映）
- 変更: `src/lib/points.js`（`resolveRate()` 関数追加）
- 変更: `config/rules.json`（category_rates 追加）
- 変更: サンプル Excel（category列追加）

---

## 機能5: ランク制（年間購入額連動）

### 目的
年間購入額に応じて顧客をランク分けし、ランクごとに基本還元率を変動させる。

### 設計
- `customers` テーブルに `tier TEXT DEFAULT 'general'` 列を追加
- ランク判定バッチ: 年度（4月〜翌3月）の購入合計額で判定
- ランクは月次バッチで自動更新

### ランク区分
| ランク | キー | 年間購入額 | 基本還元率 |
|--------|------|-----------|-----------|
| 一般 | general | 〜500万円 | 0.1% |
| シルバー | silver | 500万〜1000万円 | 0.15% |
| ゴールド | gold | 1000万円〜 | 0.2% |

### rules.json への追加
```json
"tiers": {
  "general":  { "min_amount": 0,        "rate": 0.001 },
  "silver":   { "min_amount": 5000000,  "rate": 0.0015 },
  "gold":     { "min_amount": 10000000, "rate": 0.002 }
}
```

### レート解決の最終優先順位
1. `customer_rates`（顧客個別指定）— 最優先
2. `category_rates`（商品分類別）
3. `tiers`（ランクによる基本率）
4. `default_rate`（フォールバック）

### CLI
```bash
npm run update:tiers     # ランク判定バッチ
```

### スキーマ変更
```sql
ALTER TABLE customers ADD COLUMN tier TEXT DEFAULT 'general';
```

### ファイル変更
- 新規: `src/update-tiers.js`
- 変更: `docs/schema.sql`（tier 列追加）
- 変更: `src/init.js`（マイグレーション）
- 変更: `src/lib/points.js`（ランク込みレート解決）
- 変更: `src/import-transactions.js`（ランク参照）
- 変更: `src/monthly.js`（ランク更新ステップ追加）
- 変更: `src/export-customer-views.js`（ランク表示追加）
- 変更: `config/rules.json`（tiers 追加）
- 変更: `package.json`（scripts に "update:tiers" 追加）

---

## 月次バッチ処理フロー（全機能追加後）

```
1. 取引取込 & ポイント付与（顧客別/分類別/ランク別レート適用）
2. 失効バッチ（期限切れポイントの処理）
3. ランク更新（年度購入額に基づく判定）
4. 残高一覧Excel出力
5. 顧客向けHTML生成（ランク表示込み）
```

---

## 既存動作への影響

- 全機能追加後も、`customer_rates`/`category_rates`/`tiers` が空の場合は既存と同じ 0.1% 一律動作
- 既存の EARN/CANCEL ロジックは変更しない
- 元帳方式は厳守（残高カラムの追加なし）
- サンプルデータでの期待残高は変わらない（新設定はデフォルト空）
