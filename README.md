# ShiftFlow AI

> AIがシフトを自動生成するシフト管理Webアプリ

![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FF6C37?style=flat-square&logo=firebase&logoColor=white)
![Gemini API](https://img.shields.io/badge/Gemini_API-4285F4?style=flat-square&logo=google&logoColor=white)

---

## 解決する課題

シフト作成は管理者にとって手間のかかる作業です。スタッフの希望・必要人数・曜日ごとの制約を手動で調整するのは時間がかかります。このアプリはスタッフの希望をAIに渡して最適なシフトを自動生成し、管理者の作業時間を大幅に削減します。

---

## 機能

### 管理者向け
- スタッフ一覧の管理・シフト設定（必要人数・営業時間など）
- AIへのシフト自動生成依頼（Gemini APIが最適化）
- 希望変更申請の承認・却下
- 完成したシフトの公開

### スタッフ向け
- 自分のシフト確認（モバイル対応）
- 希望シフト・シフト変更の申請
- リアルタイムの更新通知

---

## 技術的なポイント

- **Google Gemini API** によるシフト自動生成：スタッフの希望・人数制約・連勤上限をプロンプトで渡し、最適なシフト表をJSON形式で出力
- **Firebase Firestore** のリアルタイムリスナーで、シフト更新が即座に全スタッフへ反映
- **Firebase Auth** でロールベースのアクセス制御（管理者 / スタッフ）
- ロールに応じてUIを完全に切り替える設計で、操作ミスを防止

---

## 技術スタック

| カテゴリ | 技術 |
|---|---|
| フロントエンド | React / TypeScript / Vite |
| スタイリング | Tailwind CSS |
| データベース | Firebase Firestore |
| 認証 | Firebase Auth |
| AI | Google Gemini API |

---

## セットアップ

```bash
npm install
cp .env.example .env.local
# .env.local に Firebase と Gemini API キーを設定
npm run dev
```

環境変数の詳細は `.env.example` を参照してください。
