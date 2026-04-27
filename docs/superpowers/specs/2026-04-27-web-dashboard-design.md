# 機能6: Webアプリ化（社内管理ダッシュボード）設計書

## 概要

社内事務員向けの管理ダッシュボード。ブラウザから残高確認、取引管理、ポイント操作、Excelアップロードまで全業務を完結させる。

## 利用者

- 社内事務員（数名）
- 共有パスワード認証

## 技術スタック

- Express + EJS（サーバーサイドレンダリング）
- Tailwind CSS（CDN）
- 既存の src/lib/ を共有（ロジック重複なし）
- 追加: express, ejs, express-session, multer, bcrypt, dotenv

## アーキテクチャ

```
src/web/
├── app.js              # Express アプリ定義
├── server.js           # サーバー起動
├── middleware/
│   └── auth.js         # セッション認証 + CSRF
├── routes/
│   ├── login.js        # ログイン/ログアウト
│   ├── dashboard.js    # ダッシュボード（残高一覧）
│   ├── customers.js    # 顧客一覧・詳細
│   ├── transactions.js # 取引管理（Excel取込）
│   ├── redeem.js       # ポイント利用
│   └── cancel.js       # 取消
└── views/
    ├── layout.ejs      # 共通レイアウト
    ├── login.ejs
    ├── dashboard.ejs
    ├── customers.ejs
    ├── customer-detail.ejs
    ├── transactions.ejs
    └── _partials/
```

CLIバッチは引き続き動作。Webは追加レイヤー。

## 画面構成

### ログイン
- パスワード入力のみ（ユーザーID不要）
- .env の APP_PASSWORD_HASH（bcrypt）と比較
- セッション有効期限8時間

### ダッシュボード
- 全顧客の残高一覧��ーブル（ID, 名前, ランク, 残高）
- 合計ポイント数
- 直近の活動ログ10件

### 顧客詳細
- 残高, ランク, メール
- ポイント履歴（ページネーション）
- 直接 REDEEM / CANCEL 実行可能

### 取引管理
- Excelアップロード（月次取込 / 顧客マスタ）
- 取込結果をその場で表示
- 月次バッチ一括実行

### 操作
- REDEEM: 顧客選択 → ポイント数 → 確認 → 実行
- CANCEL: 取引ID → 確認 → 実行
- 確認ダイアログ必須

## セキュリティ

- bcrypt パスワードハッシュ
- express-session（メモリストア、8時間TTL）
- CSRF トークン（POST 操作）
- ファイルアップロード: .xlsx のみ、10MB 上限
- 全ルートに認証ミドルウェア（/login 除く）

## 既存システムとの関係

- src/lib/ の db.js, points.js, token.js を共有
- 既存CLIスクリプトの export 関数を直接呼び出し
- DBは同一の data/points.db
- CLIとWebの同時利用は想定しない（事務員が1つの方法で操作）
