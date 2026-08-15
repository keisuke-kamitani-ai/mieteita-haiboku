# 見えていた敗北

**1941年、計算は正しかった。通らなかっただけだ。**

総力戦研究所を舞台に、同じ問題を算盤と現代のORで二度解く意思決定シリアスゲーム。

---

## 公開手順（GitHub Pages）

ビルド不要。このフォルダの中身をそのままリポジトリの直下に置くだけで動きます。

```bash
git init
git add .
git commit -m "見えていた敗北"
git branch -M main
git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
git push -u origin main
```

GitHub のリポジトリで **Settings → Pages** を開き、

- Source: `Deploy from a branch`
- Branch: `main` / `/ (root)`

数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます。

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | エントリ。React・Tailwind・Babel を CDN から読み込む |
| `app.jsx` | 本体。ブラウザ上で Babel が変換して実行する |
| `.nojekyll` | GitHub Pages の Jekyll 処理を止める |

---

## 閣僚の台詞について

閣議での**可否の判定は常に決定論エンジン**が行います。LLM は判定結果に言葉を与えるだけで、判定には一切関与しません。プレイヤーが「刺さる言い回し」を探すゲームに変質させないための設計です。

静的公開の既定では、**台本に書かれた台詞**が使われます。ブラウザに API キーを置くことはできないためです。

LLM 生成を使いたい場合は、サーバ側にプロキシを立て、`index.html` の該当行のコメントを外してください。

```js
window.__MINISTER_ENDPOINT__ = "https://your-proxy.example.com/messages";
```

プロキシは `{ model, max_tokens, messages }` を受け取り、Anthropic API の `content` 配列をそのまま返す形にします。**API キーは必ずサーバ側に置いてください。**

---

## 本番運用にあたって

現状は CDN 依存の構成です。展示会や研修で回線が不安定な場所で使う場合は、Vite などでバンドルして自己完結させることを推奨します。

```bash
npm create vite@latest -- --template react
# app.jsx の内容を src/App.jsx に移し、先頭の
#   const { useState, useMemo, useEffect, useRef } = React;
# を
#   import React, { useState, useMemo, useEffect, useRef } from "react";
# に戻し、末尾の createRoot 呼び出しを src/main.jsx へ移す
npm i -D tailwindcss @tailwindcss/vite
npm run build
```

`vite.config.js` に `base: "/<リポジトリ名>/"` を指定し、`dist/` を Pages に公開します。

---

## 史実について

本作の記述は概略です。公開にあたっては一次資料および専門家の監修を推奨します。特に以下は誤解が生じやすい点です。

- **総力戦研究所**（内閣直轄）と**秋丸機関**（陸軍省主計課の研究班）は別組織です
- 四半期単位の破綻時期は本作の計算エンジンの出力であり、実際の演習報告が示したのは「1943〜44年ごろ」という年単位の予測でした
- **ブラケットら英国ORの功績は護送船団という方式の発明ではなく**、船団をどの規模にすれば被害が最も減るかを統計で証明したことです

---

## ライセンス / クレジット

企画・実装の詳細は同梱の企画書（`総力戦研究所1941_企画書_v3.md`）を参照してください。
