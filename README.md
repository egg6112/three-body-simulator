# 🌌 三体問題 カオス軌道シミュレーター

重力で引き合う3つの天体の軌道をリアルタイムで描画するシミュレーターです。
カオス理論の代表例「三体問題」を、美しい星空背景とともにブラウザで体験できます ✨

## 🌐 公開URL

[https://egg6112.github.io/three-body-simulator/](https://egg6112.github.io/three-body-simulator/)

## ✨ 機能・特徴

- **4種類のプリセット** — ランダムカオス・8の字周期解・ラグランジュ三角形・ピタゴラス問題
- **高精度な物理エンジン** — 4次ルンゲ=クッタ法 + 近接遭遇時の適応刻み幅
- **エネルギー保存の監視** — HUD でリアルタイムに数値誤差を表示
- **カメラ自動追尾** — 天体の動きに合わせてスムーズにズーム・パン
- **動画として録画** — WebM 形式でシミュレーション映像をダウンロード
- **速度・軌跡長さをスライダーで調整**

## 🛠 使用技術

- React 19
- Vite 6
- Canvas 2D API（加算合成による発光描画）
- GitHub Actions / GitHub Pages（自動デプロイ）

## 📂 ファイル構成

```
three-body-simulator/
├── three-body-simulator.jsx   # 物理エンジン + React コンポーネント（全機能）
├── src/
│   ├── main.jsx               # React エントリーポイント
│   └── App.jsx                # ルートコンポーネント
├── index.html
├── vite.config.js
└── .github/workflows/
    └── deploy.yml             # GitHub Pages 自動デプロイ
```

## 🚀 ローカルで動かす方法

```bash
git clone https://github.com/egg6112/three-body-simulator.git
cd three-body-simulator
npm install
npm run dev
```

ブラウザで `http://localhost:5173/three-body-simulator/` を開く。
