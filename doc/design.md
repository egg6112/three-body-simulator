# 三体問題カオス軌道シミュレーター 設計書

## 1. プロジェクト概要

### 1.1 目的

重力多体問題の中でも最も基本的な「三体問題」を、物理的に正確なシミュレーションとして実装し、ブラウザ上でインタラクティブに可視化する。カオス的ふるまいや周期解といった多様な軌道パターンをリアルタイムで体験できることを目標とする。

### 1.2 公開URL

https://egg6112.github.io/three-body-simulator/

### 1.3 技術スタック

| 種別 | 採用技術 |
|---|---|
| UI フレームワーク | React 19 |
| ビルドツール | Vite 6 |
| 描画 API | Canvas 2D API |
| 数値計算 | JavaScript (Float64Array) |
| デプロイ | GitHub Actions + GitHub Pages |

---

## 2. ファイル構成

```
three-body-simulator/
├── three-body-simulator.jsx   # 全機能を収めた単一コンポーネント
├── src/
│   ├── main.jsx               # ReactDOM.createRoot エントリーポイント
│   └── App.jsx                # ThreeBodySimulator を呼び出すだけのルート
├── index.html                 # Vite HTML テンプレート
├── vite.config.js             # base パス・プラグイン設定
├── package.json
├── .github/workflows/
│   └── deploy.yml             # main push → gh-pages 自動デプロイ
└── doc/
    └── design.md              # 本設計書
```

`three-body-simulator.jsx` が唯一の実装ファイルであり、物理エンジン・描画・UI の全レイヤーを内包する。

---

## 3. アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│                ThreeBodySimulator (React)            │
│                                                     │
│  ┌──────────────┐   ┌──────────────┐               │
│  │  物理エンジン  │   │   描画エンジン  │               │
│  │  (純粋関数群) │   │ (Canvas 2D)  │               │
│  └──────┬───────┘   └──────┬───────┘               │
│         │ stateRef          │ canvasRef             │
│         └──────────────┬───┘                       │
│                        │                           │
│              requestAnimationFrame ループ            │
│           (useEffect 内の単一 RAF コールバック)        │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  useRef (ミュータブル / 再レンダーなし)         │   │
│  │  stateRef · trailsRef · camRef · runningRef  │   │
│  │  speedRef · trailLenRef · recorderRef        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  useState (UI 駆動 / 再レンダーあり)           │   │
│  │  running · preset · speed · trailLen · hud   │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**設計方針**: アニメーションループ中で `setState` を呼ぶと毎フレーム再レンダーが発生するため、シミュレーション状態はすべて `useRef` に格納する。UI コントロールが変化したときのみ `useState` を更新し、`useEffect` で対応する `ref` に同期させる。

---

## 4. 物理エンジン

### 4.1 状態表現

```
state = {
  pos: Float64Array(6),   // [x1, y1, x2, y2, x3, y3]
  vel: Float64Array(6),   // [vx1, vy1, vx2, vy2, vx3, vy3]
  m:   number[3]          // 各天体の質量
}
```

座標・速度を 1 本のフラット配列に格納することで、RK4 の各段 (k1〜k4) の加算を単純なループで処理できる。

### 4.2 重力加速度の計算

```
computeAccel(state) → { ax[3], ay[3] }
```

- ニュートン万有引力: **F = G·m_i·m_j / r²**
- G = 1.0（無次元単位系）
- ゼロ除算回避: 分母に 1×10⁻⁹ のソフトニング項を加える

```
r² = dx² + dy² + 1e-9
f  = G / (r² · r)       // = G / r³
ax[i] += f · m[j] · dx
ax[j] -= f · m[i] · dx  // 作用反作用
```

### 4.3 4次ルンゲ=クッタ法 (RK4)

```
derivative(state) → Float64Array(12)
  // [dx1,dy1,..., dvx1,dvy1,...]  各 pos の時間微分 = vel、各 vel の時間微分 = accel

rk4Step(state, h) → nextState
  k1 = derivative(state)
  k2 = derivative(state + h/2 · k1)
  k3 = derivative(state + h/2 · k2)
  k4 = derivative(state + h   · k3)
  nextState = state + (h/6)(k1 + 2k2 + 2k3 + k4)
```

### 4.4 適応刻み幅

1フレームあたりの積分量を固定しつつ、天体間の最短距離 `dmin` に応じて刻み幅 `h` を動的に変える。

```
remaining = 0.012 × speed      // 1フレームのシミュレーション時間
hStep = 2.5e-3 × min(1, (dmin/0.5)^1.5)
hStep = clamp(hStep, 2e-7, remaining)
```

- 近接遭遇時 (dmin → 0) に `hStep` が急激に縮小し、数値爆発を防ぐ
- 1 フレームあたり最大 600 回の積分ステップを上限とする

### 4.5 エネルギー保存チェック

```
totalEnergy(state) = 運動エネルギー + ポテンシャルエネルギー
  = Σ (1/2 · m_i · v_i²) - Σ G·m_i·m_j / r_ij
```

初期エネルギー E₀ との相対誤差 `|ΔE/E₀|` を HUD に表示し、積分精度の指標とする。

---

## 5. 初期条件プリセット

| キー | 名称 | 説明 |
|---|---|---|
| `random` | ランダム(カオス) | 円上にランダム配置。全運動量=0・重心=原点に正規化 |
| `eight` | 8の字周期解 | Chenciner–Montgomery (2000) の解析解。等質量3体が同一軌道を追いかける |
| `lagrange` | ラグランジュ三角形 | 等質量正三角形配置。微小摂動を加えてカオスへの崩壊を可視化 |
| `pythagoras` | ピタゴラス問題 | Burrau の 3:4:5 質量問題。静止状態から激しい近接遭遇が発生 |

---

## 6. 描画パイプライン

1フレームの描画処理は以下の順序で実行される。

```
1. 星空背景 (drawImage)
   └── starsRef: リサイズ時にのみ再生成されるオフスクリーン Canvas
       グラデーション背景 + ランダム配置の星 (密度: 1点/5000px²)

2. 軌跡 (globalCompositeOperation = "lighter" / 加算合成)
   └── 末端ほど明るく・太く (alpha ∝ (i/N)^2.2, width ∝ t)
   └── 6セグメントをまとめて描画してdrawコール数を削減

3. 天体 (globalCompositeOperation = "source-over")
   └── 外側ハロー: 大径の放射状グラデーション (半透明)
   └── 本体コア: 小径の放射状グラデーション (中心が白→カラー)
   └── 半径 ∝ cbrt(質量) (質量比を視覚的に表現)

4. HUD更新 (12フレームに1回 setHud)
   └── 時刻 t、エネルギードリフト |ΔE/E₀|
```

### 6.1 座標変換

```
toScreen(x, y) = [
  (canvasWidth/2  + (x - cam.x) · cam.scale) · dpr,
  (canvasHeight/2 - (y - cam.y) · cam.scale) · dpr   // Y軸反転
]
```

### 6.2 カメラ自動追尾

全天体のバウンディングボックスから目標スケール・中心を算出し、指数平滑化でカメラを追従させる。

```
k = 0.04
cam.x     += (targetX     - cam.x)     · k
cam.y     += (targetY     - cam.y)     · k
cam.scale += (targetScale - cam.scale) · k · 0.7
```

---

## 7. 動画録画

`MediaRecorder API` を用いて Canvas ストリームを WebM (VP9) 形式でキャプチャする。

```
canvas.captureStream(60fps)
→ MediaRecorder({ mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 8Mbps })
→ ondataavailable で Blob を蓄積
→ onstop で Blob URL を生成 → <a> タグによる自動ダウンロード
```

---

## 8. デプロイフロー

```
git push origin main
        │
        ▼
GitHub Actions (.github/workflows/deploy.yml)
  1. actions/checkout@v4
  2. Node.js 22 セットアップ
  3. npm ci
  4. npm run build  →  dist/ を生成
  5. peaceiris/actions-gh-pages@v4  →  gh-pages ブランチへ dist/ をプッシュ
        │
        ▼
GitHub Pages が gh-pages ブランチを配信
https://egg6112.github.io/three-body-simulator/
```

Vite の `base: '/three-body-simulator/'` 設定により、サブパス配信でもアセットのパスが正しく解決される。

---

## 9. 数値精度と既知の限界

| 項目 | 詳細 |
|---|---|
| 積分法 | RK4（4次精度）。シンプレクティック法ではないためエネルギーは長時間で緩やかに漂流する |
| ソフトニング | 1×10⁻⁹ の固定値。非常に近接した遭遇では物理的に不正確になる |
| 軌跡配列 | FIFO キュー (`shift`)。最大長に達した後は O(N) の削除が毎フレーム発生する |
| HUD 更新頻度 | 12フレームに1回の `setState` で再レンダーを抑制 |
