# 🤖 AIシフト自動生成システム

スタッフの希望シフトをもとに、Gemini AIが最適なシフト表を自動生成するWebアプリです。

🖥️ **[デモを見る](https://shift-maike.pages.dev/)**

---

## ✨ 主な機能

- **希望シフト収集** — スタッフが希望出勤日・時間帯をWebから登録
- **AI自動シフト生成** — Gemini AIが人員バランスを考慮した最適シフトを自動作成
- **シフト表出力** — 生成されたシフトをわかりやすい一覧表で表示
- **手動調整** — AI生成後に管理者が個別調整可能

## 🛠️ 技術スタック

| 分類 | 技術 |
|------|------|
| フロントエンド | React 19 / TypeScript |
| スタイリング | Tailwind CSS 4 |
| データ | localStorage（サーバー不要） |
| AI | Gemini API（シフト最適化） |
| ビルド | Vite 6 |
| デプロイ | Cloudflare Pages |

## 🚀 ローカル実行

```bash
git clone https://github.com/tatagen/Shift-Maike.git
cd Shift-Maike
npm install
npm run dev
```

> データはブラウザの localStorage に保存されます。環境変数・外部サービスの設定は不要です。
> AIシフト生成機能を使う場合は `.env` に `GEMINI_API_KEY` を設定してください。

## 🚀 デプロイ（Cloudflare Pages）

| 設定 | 値 |
|------|----|
| ビルドコマンド | `npm run build` |
| 出力ディレクトリ | `dist` |
| 環境変数（AI機能用） | `GEMINI_API_KEY` |
