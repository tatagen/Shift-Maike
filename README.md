# 📅 AI シフト自動生成システム「シフトメーカー」

Google Gemini AI がスタッフの希望・シフトルールを読み取り、最適なシフト表を自動生成するWebアプリです。

---

## ✨ 主な機能

- **AIシフト自動生成** — Gemini AI がスタッフの希望・必要人数・曜日ルールを考慮してシフトを作成
- **シフト編集** — 生成されたシフトを手動で微調整可能
- **スタッフ管理** — 従業員の希望休・スキルレベルを登録
- **Firebase リアルタイム同期** — 管理者・スタッフ間でシフト情報をリアルタイム共有
- **shadcn/ui** による洗練されたUI

## 🛠️ 技術スタック

| 分類 | 技術 |
|------|------|
| フロントエンド | React 19 / TypeScript |
| UI コンポーネント | shadcn/ui |
| AI | Google Gemini API |
| データ | Firebase Firestore |
| ビルド | Vite 6 + Express |

## 🚀 ローカル実行

```bash
git clone https://github.com/tatagen/Shift-Maike.git
cd Shift-Maike
npm install
# .env.local に GEMINI_API_KEY と Firebase の設定を記入
npm run dev
```

> `GEMINI_API_KEY` と Firebase プロジェクトの設定が必要です。