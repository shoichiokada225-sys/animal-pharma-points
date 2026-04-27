# 動物医薬品卸 ポイントシステム

## プロジェクト概要

動物医薬品卸売業の顧客向けポイントシステム。月次バッチで取引データを取り込み、購入金額に応じてポイントを自動付与する。**ポイントを「貯める」ことに特化**し、利用機能は将来拡張する設計。

### コアルール

- **還元率: 0.1%(購入金額1円あたり0.001pt、円未満切り捨て)**
- 例: 100,000円購入 → 100pt付与
- 例: 9,500円購入 → 9pt付与(切り捨て)
- 1pt = 1円相当(将来の利用機能で使用)

### 利用者

- 社内事務員: 月次バッチ実行、結果確認
- 顧客(50社想定): トークン付きURLで自社のポイント残高・履歴を閲覧

---

## 設計の重要原則

### 1. 元帳(ledger)方式

ポイント残高を直接保持せず、すべての加減算を `point_ledger` に1行ずつ記録する。残高は元帳の合計で算出。これにより以下が可能:

- 全履歴の追跡(監査対応)
- 任意時点の残高再現
- 取消・修正がきれい

### 2. 取引IDによるべき等性

同じ `transaction_id` で2回付与しないこと。CSVを誤って2回取り込んでも安全であるべき。元帳テーブルで `(type='EARN', transaction_id)` をユニークキーとする。

### 3. 設定の外部化

還元率は `config/rules.json` に外出し。コード変更なしで率の変更や将来の顧客別レート対応が可能。

### 4. 将来拡張への配慮

`point_ledger.type` は 'EARN' / 'CANCEL' / 'EXPIRE' / 'REDEEM' を最初から定義。MVPでは 'EARN' と 'CANCEL' のみ実装するが、スキーマは将来分も持つ。

---

## 技術スタック

- **言語**: Node.js (ES Modules, v20以降)
- **DB**: SQLite (`better-sqlite3`)
- **Excel**: `exceljs`
- **HTML出力**: テンプレート文字列(ライブラリ不要)
- **CLI**: `npm scripts` で十分(複雑なCLIフレームワーク不要)

ライブラリは最小限。Webサーバーは初期段階では不要(顧客向けHTMLは静的ファイル生成のみ)。

---

## ディレクトリ構成

```
animal-pharma-points/
├── CLAUDE.md                # このファイル
├── README.md                # 運用手順
├── package.json
├── config/
│   └── rules.json           # 還元率設定
├── data/
│   ├── points.db            # SQLite本体(.gitignore対象)
│   ├── input/               # 取引Excelの置き場
│   └── output/              # 生成物(残高一覧Excel、顧客向けHTML)
├── docs/
│   └── schema.sql           # DBスキーマ定義
└── src/
    ├── db.js                # SQLite接続・初期化
    ├── import-customers.js  # 顧客マスタ取込
    ├── import-transactions.js # 取引取込&ポイント付与
    ├── cancel.js            # 取引取消(返品対応)
    ├── export-summary.js    # 社内向け残高一覧Excel出力
    ├── export-customer-views.js # 顧客向けHTML生成
    └── lib/
        ├── ledger.js        # 元帳操作の共通関数
        └── points.js        # ポイント計算ロジック(0.1%等)
```

---

## データ仕様

### 顧客マスタ Excel(取込元)

ファイル名: `data/input/customers.xlsx`

| 列 | 必須 | 例 |
|---|---|---|
| customer_id | ◯ | C0001 |
| customer_name | ◯ | 株式会社○○牧場 |
| email | △ | info@example.com |

### 取引 Excel(取込元)

ファイル名: `data/input/transactions_YYYYMM.xlsx`(月次)

| 列 | 必須 | 例 |
|---|---|---|
| transaction_id | ◯ | T20260401-001 |
| customer_id | ◯ | C0001 |
| transaction_date | ◯ | 2026-04-01 |
| amount | ◯ | 125000 (円・税抜) |

**注**: amountは税抜金額とする。税込にすると消費税分にもポイントが付き、税制上煩雑になる。

### 出力1: 残高一覧Excel(社内向け)

ファイル名: `data/output/balance_YYYYMMDD.xlsx`

各顧客の現在残高と直近の付与履歴を含む。

### 出力2: 顧客向けHTML

ファイル名: `data/output/views/{token}.html`

各顧客に発行されたトークンに対応するHTMLファイル。
- 顧客名
- 現在の残高
- 直近12ヶ月の付与履歴
- 注意書き(「本ページのURLは他者と共有しないでください」)

トークンは初回顧客登録時に32文字の安全な乱数を生成し、`customers.view_token` に保存。生成済みトークンは変えない。

---

## コマンド一覧

```bash
# 初期セットアップ(初回のみ)
npm run init               # DBファイル作成、スキーマ適用

# 顧客マスタ取込(新規追加・更新)
npm run import:customers   # data/input/customers.xlsx を読込

# 月次処理(毎月1回)
npm run import:transactions -- --file=transactions_202604.xlsx
                          # 取込&ポイント付与を実行

# 取消(返品など個別対応)
npm run cancel -- --transaction-id=T20260401-001

# レポート生成
npm run export:summary     # 社内向け残高一覧Excel
npm run export:views       # 顧客向けHTML一括生成

# まとめて月次実行
npm run monthly -- --file=transactions_202604.xlsx
                          # import → export:summary → export:views
```

---

## ポイント計算ロジック

```javascript
// src/lib/points.js
export function calculatePoints(amount, rate = 0.001) {
  // 円未満切り捨て
  return Math.floor(amount * rate);
}
```

### 端数処理

- **切り捨て** で統一(会社側に有利、計算が単純)
- 結果は整数のみを元帳に記録
- 将来、顧客別レートを導入する場合も同関数を使用

### 取引取込時の処理フロー

1. Excelを読込
2. 各行に対して:
   a. `transaction_id` がDBに存在するかチェック → 存在すればスキップ(警告ログ)
   b. `customer_id` が顧客マスタに存在するかチェック → なければエラー、その行は処理せず後続続行
   c. `transactions` テーブルにINSERT
   d. ポイント計算
   e. `point_ledger` に `type='EARN'` でINSERT
3. 取込結果サマリを表示(処理件数、スキップ件数、エラー件数)
4. すべてトランザクション内で実行(失敗時はロールバック)

---

## 運用ルール

### 月次フロー

1. 月初に前月分の取引Excelを `data/input/` に配置
2. `npm run monthly -- --file=transactions_202604.xlsx` を実行
3. `data/output/balance_*.xlsx` で結果確認
4. 問題なければ顧客向けHTMLを公開先にデプロイ(Cloudflare Pages等)
5. 新規顧客がいる場合のみ初回URLを案内メール送付

### 返品・取消があった場合

`npm run cancel -- --transaction-id=...` で実行。元帳に `type='CANCEL'` のマイナス行を追加(物理削除はしない)。

### バックアップ

`data/points.db` を月次でコピー保存。SQLiteは単一ファイルなのでコピーだけでバックアップ完了。

---

## MVP のスコープ(最初のリリース)

**実装する**:
- 顧客マスタ取込
- 取引取込&ポイント付与(0.1%固定)
- 取引取消
- 社内向け残高Excel出力
- 顧客向け静的HTML出力

**実装しない(将来拡張)**:
- 顧客別/商品別レート
- ランク制
- ポイント有効期限・失効バッチ
- ポイント利用機能
- Webアプリ(認証付き)
- 販売管理システムとのAPI直結

スキーマ・コードは将来拡張を阻害しない作りにする。

---

## コーディング規約

- ES Modules(`"type": "module"`)
- ファイル1つの責務を1つに(分かりやすさ最優先)
- DB操作は `src/lib/ledger.js` に集約
- ロギングは `console.log` で十分(運用規模が小さいため)
- エラーハンドリング: 1件のエラーで全体を止めない。エラー件数をサマリに表示。
- コメントは日本語OK

---

## 注意事項

### 法令・規制

- 動物用医薬品の販売は薬事法令(医薬品医療機器等法、動物用医薬品等取締規則)の規制対象
- 還元率0.1%は控えめな水準だが、業界の公正競争規約がある場合は事前確認
- 顧客個人(担当者)ではなく**法人(顧客)に対してポイントを付与**する設計を厳守

### 税務

- ポイント発行時の会計処理は税理士と要相談(値引き処理 or 引当金)
- 本MVPの範囲では会計仕訳は出力しない
