# Claude Code 作業プロトコル

このプロジェクト(動物医薬品卸 ポイントシステム)を Claude Code で安全に拡張・保守するための手順書。

---

## 0. 基本原則

1. **`CLAUDE.md` が仕様の Single Source of Truth**
   コードと仕様が食い違ったら、まず `CLAUDE.md` の方が正しいかを判断する。仕様変更時は先に `CLAUDE.md` を更新してから実装する。

2. **元帳(point_ledger)方式は絶対に変えない**
   残高をテーブルに直接保存する変更は禁止。すべての加減算は `point_ledger` への INSERT で表現する。

3. **変更前に必ず Git でコミット**
   Claude Code が予期しない変更をしても `git checkout` で戻せる状態を維持する。

4. **小さく依頼し、すぐ動作確認する**
   1回のプロンプトで複数機能をまとめて依頼しない。1機能ごとに動作確認 → コミット → 次の依頼。

---

## 1. 初期セットアップ

### 1.1 Claude Code のインストール

公式ドキュメントの最新手順を参照: <https://docs.claude.com/en/docs/claude-code/overview>

2026年4月現在、**ネイティブインストーラ(Node.js不要)**が推奨。npm経由も可能(`npm install -g @anthropic-ai/claude-code`)。

利用には Claude のサブスクリプション(Pro/Max/Team/Enterprise)または API キーが必要。

### 1.2 Git の初期化

```bash
cd ~/Desktop/animal-pharma-points
git init
git add .
git commit -m "Initial commit (from Anthropic-provided package)"
```

これを**最初に必ず実行**する。これがないと、Claude Codeが意図せぬファイルを書き換えても元に戻せない。

### 1.3 動作確認

Claude Code に依頼する前に、まず人手で同梱コードが動くことを確認する:

```bash
npm install
npm run init
npm run import:customers
npm run monthly -- --file=transactions_202604.xlsx
```

期待される残高:

| 顧客 | 残高 |
|---|---|
| C0001 | 536 pt |
| C0002 | 574 pt |
| C0003 | 1,740 pt |
| C0004 | 892 pt |
| C0005 | 156 pt |

これが出れば環境は正常。

---

## 2. Claude Code 初回起動プロトコル

### 2.1 起動

プロジェクトルートで:

```bash
cd ~/Desktop/animal-pharma-points
claude
```

### 2.2 コンテキスト読込プロンプト(コピペ用)

Claude Code との最初のメッセージは**必ずこれ**:

```
このプロジェクトの構造を理解してください。以下の順で読んでください:

1. CLAUDE.md(プロジェクト仕様)
2. README.md(運用手順)
3. docs/schema.sql(DBスキーマ)
4. config/rules.json(還元率設定)
5. src/ 配下の実装コード(import-transactions.js から読むのがおすすめ)

読み終わったら、このプロジェクトの設計方針(特に「元帳方式」「べき等性」「将来拡張への備え」)を3行以内で要約してください。
```

要約が的を射ていれば、Claude Code は仕様を把握できている。ズレていたら追加で説明するか、再度読み直しを依頼する。

---

## 3. 機能追加プロトコル

### 3.1 良いプロンプトの構造

```
[何を]    機能の概要(1〜2文)
[制約]    既存の設計と矛盾しないこと(元帳方式維持、など)
[I/O例]   具体的な入出力(コマンド例、期待される結果)
[検証]    動作確認の方法
[文書]    更新すべきドキュメント
```

### 3.2 例: ポイント利用機能(REDEEM)の追加

**❌ 悪い例:**
> ポイント使う機能つけて

**✅ 良い例:**
```
[何を] ポイント利用機能(REDEEM)を実装してください。

[制約]
- 元帳方式を維持(point_ledger への INSERT で表現)
- type='REDEEM' で負の値を記録
- 残高不足時はエラーで終了(部分利用は不可)
- 既存の EARN/CANCEL ロジックには手を入れないこと

[I/O例]
コマンド: npm run redeem -- --customer-id=C0001 --points=100 --note="商品A交換"
成功時: 「✅ 利用記録: C0001, -100pt, 残高 ○○ pt」
失敗時: 「❌ 残高不足: 現在 ○○ pt」と非ゼロ終了

[検証]
1. C0001(現残高536pt)から 100pt 利用 → 残高436pt
2. 同顧客から 1000pt 利用しようとしてエラー
3. 元帳に REDEEM 行が追加されている

[文書]
- package.json の scripts に "redeem" を追加
- README.md の月次運用フローに「ポイント利用」節を追加
- CLAUDE.md の MVPスコープから REDEEM を「実装する」側に移動
```

### 3.3 例: 還元率の顧客別対応

```
[何を] 顧客ごとに異なる還元率を設定可能にしてください。

[制約]
- config/rules.json に customer_rates セクションを追加
- 顧客IDが customer_rates にあれば優先、なければ default_rate を使う
- 既存の挙動(全顧客一律 0.001)はデフォルトで維持される

[設定例]
{
  "default_rate": 0.001,
  "customer_rates": {
    "C0003": 0.002,
    "C0004": 0.0015
  },
  "rounding": "floor"
}

[検証]
- C0003 で 100,000円購入 → 200pt(0.2%)
- C0001 で 100,000円購入 → 100pt(0.1%、デフォルト)

[文書]
- config/rules.json のコメント更新
- CLAUDE.md の「設計の重要原則 > 設定の外部化」節を更新
```

---

## 4. 動作確認プロトコル

### 4.1 機能追加後の標準テスト

```bash
# 1. クリーン状態を作る(本番DBは絶対に消さないこと、テスト用環境で実行)
rm -f data/points.db data/points.db-wal data/points.db-shm
rm -rf data/output/*
mkdir -p data/output/views

# 2. 初期化
npm run init

# 3. サンプルデータで動作確認
npm run import:customers
npm run monthly -- --file=transactions_202604.xlsx

# 4. 期待残高チェック
node -e "import('./src/lib/db.js').then(({getDb})=>{const db=getDb();db.prepare('SELECT customer_id, balance FROM v_balance').all().forEach(r=>console.log(r));db.close()})"
```

### 4.2 Claude Code への動作確認依頼

```
変更を加えたら、以下を必ず実行して結果を貼ってください:

1. クリーンDB作成
   rm -f data/points.db data/points.db-* && rm -rf data/output/* && mkdir -p data/output/views

2. 初期化と取込
   npm run init && npm run import:customers && npm run monthly -- --file=transactions_202604.xlsx

3. 残高確認(C0001=536, C0003=1740 等が出るか)
   node -e "..."

エラーが出たら自動で修正を試みず、まず私に報告してください。
```

最後の一文は重要。Claude Code が試行錯誤で大量に変更してしまうのを防ぐ。

---

## 5. Git による変更管理

### 5.1 機能追加サイクル

```bash
# 機能ブランチを切る
git checkout -b feature/redeem-points

# Claude Code に依頼 → 動作確認

# OK ならコミット
git add .
git commit -m "Add REDEEM feature"

# main にマージ
git checkout main
git merge feature/redeem-points
```

### 5.2 失敗からの復旧

Claude Code の変更が壊れた場合:

```bash
# 何が変わったか確認
git diff

# すべての変更を捨てる
git checkout .

# 一部のファイルだけ捨てる
git checkout src/import-transactions.js

# コミット済みなら1つ前に戻す
git reset --hard HEAD^
```

### 5.3 DBの復旧

```bash
# 本番DBは別途バックアップしておくこと
cp data/points.db backups/points_$(date +%Y%m%d).db

# 壊れた場合
cp backups/points_20260425.db data/points.db
```

---

## 6. プロジェクト固有のルール(Claude Codeに伝える)

機能追加時のプロンプトに、必要に応じて以下を貼り付ける:

```
このプロジェクトで守るべきルール:

1. 元帳方式の維持
   ポイント残高を customers テーブル等に保持しない。すべて point_ledger の SUM で算出する。

2. べき等性の維持
   同一 transaction_id で重複付与しない仕組み(部分ユニークインデックス)を変更しない。

3. ハードコード禁止
   還元率は config/rules.json から読む。コード内に 0.001 を直書きしない。

4. ライブラリ固定
   - DB: better-sqlite3
   - Excel: exceljs(xlsx パッケージは使わない)
   勝手に別ライブラリへ置き換えない。

5. 法人ポイント原則
   ポイントは「顧客(法人)」に紐付ける。担当者個人ID等を customers テーブルに追加する変更は事前確認を求めること。

6. ログメッセージ・コメント
   日本語OK。識別子(変数名・関数名)は英語。

7. 破壊的変更の事前確認
   既存テーブルの列削除、既存スクリプトのコマンド名変更、ライブラリ追加は、実装前に必ず計画を提示して確認を取ること。
```

---

## 7. アンチパターン(やってはいけないこと)

| × やらない | ◯ やる |
|---|---|
| 「いい感じに改善して」 | 具体的に何をどう変えるか指定する |
| 1プロンプトで複数機能を依頼 | 1機能ごとに依頼 → 検証 → コミット |
| 動作確認なしで次の依頼 | 必ず動作確認してから次へ |
| Git なしで作業 | 機能追加前に必ずコミット |
| Claude Code に「全部任せる」 | 仕様は人が決め、実装を任せる |
| 本番DB上で実験 | テスト用ディレクトリにコピーして実験 |

---

## 8. トラブルシューティング

### 8.1 Claude Code が CLAUDE.md を無視している
セッション開始時に明示的に読み込ませる(セクション 2.2 のプロンプト)。
あるいは `/init` で再読込を依頼。

### 8.2 SQLite の WAL ファイルが残る
正常な挙動。`data/points.db-wal` `data/points.db-shm` は SQLite が使う一時ファイル。`.gitignore` で除外済み。

### 8.3 取込時に「未登録の顧客ID」エラー
取引Excelの customer_id が customers テーブルにない。先に顧客マスタを登録するか、Excelの顧客IDを修正する。

### 8.4 同じ取引IDが既に登録されている
意図的な再取込ならOK(自動スキップされる)。意図しない場合は `npm run cancel -- --transaction-id=xxx` で取消するか、DBを直接編集。

### 8.5 顧客向けHTMLのデザインを変えたい
`src/export-customer-views.js` の `renderHtml` 関数内のCSSを編集。Claude Code に依頼する場合:

```
src/export-customer-views.js の renderHtml 関数のCSSを以下の方針で変更してください:
- ブランドカラーは #2b5fd1(現状)から #1a8754(緑)に変更
- balance-card の背景色も同色系に
- それ以外のレイアウトは変更しない

確認のため変更後に npm run export:views を実行し、生成されたHTMLの該当箇所を抜粋して報告してください。
```

---

## 9. 拡張ロードマップ案

優先度順に並べた今後の機能。各項目を 1 機能 = 1 ブランチ で進める想定。

1. **ポイント利用(REDEEM)** — 一番小さく追加可能、ledger方式の検証にもなる
2. **顧客別レート** — config/rules.json 拡張
3. **ポイント有効期限と失効バッチ** — point_ledger に valid_until 列追加が必要
4. **商品分類別レート** — transactions に category 列追加が必要
5. **ランク制(年間購入額連動)** — customers に tier 列、月次でランク計算バッチ
6. **Webアプリ化** — 認証付きダッシュボード(別プロジェクト化を検討)

各拡張は CLAUDE.md の「機能拡張(将来)」節に対応している。

---

## 10. 困ったときの参照先

- 公式ドキュメント: <https://docs.claude.com/en/docs/claude-code/overview>
- このプロジェクトの仕様: `CLAUDE.md`
- このプロジェクトの運用: `README.md`
- DBスキーマ: `docs/schema.sql`
