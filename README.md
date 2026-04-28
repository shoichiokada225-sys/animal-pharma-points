# 動物医薬品卸 ポイントシステム

購入金額の **0.1%** をポイント還元する社内向けポイント管理システム。
50社規模、Neon PostgreSQL、Webダッシュボード付き。

## ワンクリックデプロイ

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/shoichiokada225-sys/animal-pharma-points)

デプロイ後、発行されたURLにアクセスしてパスワード `4101` でログインしてください。

---

## セットアップ(ローカル開発)

### 1. 前提

- Node.js 20以上 (https://nodejs.org/)
- ターミナル(macOS は ターミナル.app、Windows は PowerShell)

### 2. インストール

このフォルダで:

```bash
npm install
npm run init
```

これでデータベースが作成されます(`data/points.db`)。

### 3. サンプルデータで動作確認

サンプルファイルが `data/input/` に同梱されています。

```bash
# 顧客マスタ取込
npm run import:customers

# 月次バッチ(取込 → 残高Excel → 顧客HTML を一括実行)
npm run monthly -- --file=transactions_202604.xlsx
```

実行後、`data/output/` に以下が出力されます:

- `balance_YYYYMMDD.xlsx` — 社内向け残高一覧
- `views/{token}.html` — 顧客向けHTML(各社1ファイル)
- `_token_index.csv` — 顧客とトークンの対応表(社内管理用)

---

## 月次運用フロー

### 毎月の作業

```bash
# 1. 当月の取引Excelを配置
#    ファイル名: transactions_YYYYMM.xlsx

# 2. 月次バッチ実行
npm run monthly -- --file=transactions_202604.xlsx

# 3. 結果確認
#    data/output/balance_*.xlsx を開いて確認

# 4. 顧客向けHTMLを公開先にデプロイ
#    data/output/views/ の中身を Cloudflare Pages 等にアップロード
```

### 顧客が増えた場合

`data/input/customers.xlsx` に行を追加して:

```bash
npm run import:customers
```

新規顧客には新しいトークンが発行されます。既存顧客のトークンは保持されます。

### 返品・取消

```bash
npm run cancel -- --transaction-id=T20260403-001
```

元帳にマイナス付与(取消)行が追加されます。

---

## 入力Excelのフォーマット

### `data/input/customers.xlsx`

| customer_id | customer_name | email |
|---|---|---|
| C0001 | 株式会社○○牧場 | info@example.jp |

### `data/input/transactions_YYYYMM.xlsx`

| transaction_id | customer_id | transaction_date | amount |
|---|---|---|---|
| T20260403-001 | C0001 | 2026-04-03 | 285000 |

**`amount` は税抜金額(円)** とすること。

---

## 顧客向けHTMLの公開方法

各顧客に発行された `data/output/views/{token}.html` を、Webにアップロードして専用URLを案内します。

### 推奨: Cloudflare Pages(無料)

1. [Cloudflare Pages](https://pages.cloudflare.com/) でアカウント作成
2. `data/output/views/` フォルダを丸ごとアップロード
3. 各顧客に `https://your-site.pages.dev/{token}.html` を案内

### より手軽: 社内Webサーバーや既存のレンタルサーバー

`views/` の中身を公開ディレクトリに配置するだけ。

### 注意

- トークンは推測困難な48文字。URLを知っている人だけ見られる「Security through obscurity」方式。
- 高セキュリティが必要な場合は、別途Basic認証やログイン機能の追加を検討。

---

## ファイル構成

```
animal-pharma-points/
├── CLAUDE.md                ← Claude Code用の仕様書(機能拡張時に参照)
├── README.md                ← このファイル
├── package.json
├── .gitignore
├── config/
│   └── rules.json           ← 還元率設定(現在 0.1%)
├── data/
│   ├── points.db            ← SQLite本体(npm run init で生成)
│   ├── input/               ← 取込ファイル置き場
│   │   ├── customers.xlsx
│   │   └── transactions_202604.xlsx
│   └── output/              ← 結果出力先
│       ├── balance_*.xlsx
│       ├── views/*.html
│       └── _token_index.csv
├── docs/
│   └── schema.sql           ← DBスキーマ定義
└── src/                     ← Node.js実装
    ├── init.js
    ├── import-customers.js
    ├── import-transactions.js
    ├── cancel.js
    ├── export-summary.js
    ├── export-customer-views.js
    ├── monthly.js
    └── lib/
        ├── db.js
        ├── points.js
        └── token.js
```

---

## バックアップ

`data/points.db` を月次でコピー保存してください。SQLiteは単一ファイルなのでファイルコピーだけでバックアップ完了。

```bash
# バックアップ例
cp data/points.db backups/points_$(date +%Y%m%d).db
```

---

## 設計上のポイント

### 元帳(ledger)方式
ポイントの加減算はすべて `point_ledger` テーブルに1行ずつ記録。残高は SUM で算出する。これにより全履歴の追跡・取消・修正がきれいにできる。

### べき等性
同じ取引IDで2回付与しないように、`point_ledger` に部分ユニークインデックスを設定。誤って同じExcelを2回流しても安全。

### 拡張性
`point_ledger.type` は最初から `EARN/CANCEL/EXPIRE/REDEEM` を定義。MVPでは前2つのみ実装、ポイント利用機能(`REDEEM`)は将来追加するだけで対応可能。

---

## 機能拡張(将来)

Claude Codeで `CLAUDE.md` を読ませて機能追加してください:

- 顧客別/商品別レート対応
- ポイント有効期限と失効バッチ
- ポイント利用機能(`REDEEM`)
- ランク制(年間購入額に応じた還元率変動)
- Webアプリ化(認証付きダッシュボード)

---

## 法令・税務に関する注意

- 動物用医薬品の取引は薬事法令の規制対象。業界の公正競争規約がある場合は還元率設定を事前確認すること。
- ポイント発行時の会計処理は税理士と相談を推奨(値引き処理 or 引当金)。
- ポイントは**法人(顧客)に対して付与**する設計。担当者個人への付与はしないこと。
