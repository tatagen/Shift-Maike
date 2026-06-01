# ShiftFlow AI

AIを活用したシフト自動生成・管理システムです。

## 概要

管理者がスタッフ情報とシフト要件を設定すると、AIが最適なシフト案を自動生成します。スタッフはアプリ上で自分のシフト確認や休暇申請を行えます。ロールベースの画面設計で、管理者とスタッフそれぞれに最適なUIを提供します。

## 機能

### 管理者
- AIによるシフト自動生成
- スタッフ情報の管理・シフト要件の設定
- 休暇申請の承認・却下

### スタッフ
- 自分のシフト確認
- 休暇・シフト変更申請の提出

## 技術スタック

| カテゴリ | 技術 |
|---|---|
| フロントエンド | React / TypeScript / Vite |
| スタイリング | Tailwind CSS |
| データベース | Firebase Firestore |
| 認証 | Firebase Auth |
| AI | Google Gemini API |

## セットアップ

```bash
npm install
cp .env.example .env.local
# .env.local に Firebase と Gemini API キーを設定
npm run dev
```

環境変数の詳細は `.env.example` を参照してください。
