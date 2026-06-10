import React, { useRef, useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────
// 三体問題 カオス軌道シミュレーター
// 物理: G=1 の無次元単位系 / 4次ルンゲ=クッタ法 + 近接遭遇適応刻み
// ─────────────────────────────────────────────────────────────

const G = 1.0;
const BODY_COLORS = ["#FFC36B", "#6BD5FF", "#FF7AAE"]; // 琥珀・氷青・薔薇
const BODY_NAMES = ["第一体", "第二体", "第三体"];

// ---------- 初期条件プリセット ----------
function presetRandom() {
  // 半径 ~1 の円上にランダム配置、運動量総和ゼロ
  const bodies = [];
  const angles = [0, 1, 2].map(
    (i) => (i * 2 * Math.PI) / 3 + (Math.random() - 0.5) * 1.2
  );
  for (let i = 0; i < 3; i++) {
    const r = 0.8 + Math.random() * 0.5;
    bodies.push({
      m: 0.8 + Math.random() * 0.6,
      x: r * Math.cos(angles[i]),
      y: r * Math.sin(angles[i]),
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
    });
  }
  // 重心系へ変換(全運動量ゼロ、重心原点)
  const M = bodies.reduce((s, b) => s + b.m, 0);
  let px = 0, py = 0, cx = 0, cy = 0;
  bodies.forEach((b) => {
    px += b.m * b.vx; py += b.m * b.vy;
    cx += b.m * b.x;  cy += b.m * b.y;
  });
  bodies.forEach((b) => {
    b.vx -= px / M; b.vy -= py / M;
    b.x -= cx / M;  b.y -= cy / M;
  });
  return bodies;
}

function presetFigureEight() {
  // Chenciner–Montgomery (2000) の8の字周期解
  const x = 0.97000436, y = 0.24308753;
  const vx = 0.93240737, vy = 0.86473146;
  return [
    { m: 1, x: x, y: -y, vx: vx / 2, vy: vy / 2 },
    { m: 1, x: -x, y: y, vx: vx / 2, vy: vy / 2 },
    { m: 1, x: 0, y: 0, vx: -vx, vy: -vy },
  ];
}

function presetLagrange() {
  // ラグランジュ正三角形解(等質量では不安定 → カオスへ崩壊)
  const r = 1.0;
  const omega = Math.pow(3, -0.25); // ω² = 3Gm/L³, L=√3·r
  const bodies = [];
  for (let i = 0; i < 3; i++) {
    const th = (Math.PI / 2) + (i * 2 * Math.PI) / 3;
    bodies.push({
      m: 1,
      x: r * Math.cos(th),
      y: r * Math.sin(th),
      vx: -omega * r * Math.sin(th),
      vy: omega * r * Math.cos(th),
    });
  }
  bodies[0].vx *= 1.0005; // 微小摂動で不安定性を顕在化
  return bodies;
}

function presetPythagorean() {
  // Burrau のピタゴラス問題(3:4:5)— 静止から自由落下、激しい近接遭遇
  return [
    { m: 3, x: 1, y: 3, vx: 0, vy: 0 },
    { m: 4, x: -2, y: -1, vx: 0, vy: 0 },
    { m: 5, x: 1, y: -1, vx: 0, vy: 0 },
  ];
}

const PRESETS = {
  random: { label: "ランダム(カオス)", fn: presetRandom },
  eight: { label: "8の字周期解", fn: presetFigureEight },
  lagrange: { label: "ラグランジュ三角形", fn: presetLagrange },
  pythagoras: { label: "ピタゴラス問題", fn: presetPythagorean },
};

// ---------- 物理エンジン ----------
function computeAccel(s) {
  // s: [x1,y1,x2,y2,x3,y3, vx1,vy1,...], masses m[]
  const { pos, m } = s;
  const ax = [0, 0, 0], ay = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const dx = pos[2 * j] - pos[2 * i];
      const dy = pos[2 * j + 1] - pos[2 * i + 1];
      const r2 = dx * dx + dy * dy + 1e-9; // 数値安定化のための極小ソフトニング
      const r = Math.sqrt(r2);
      const f = G / (r2 * r);
      ax[i] += f * m[j] * dx; ay[i] += f * m[j] * dy;
      ax[j] -= f * m[i] * dx; ay[j] -= f * m[i] * dy;
    }
  }
  return { ax, ay };
}

function derivative(state) {
  const { ax, ay } = computeAccel(state);
  const d = new Float64Array(12);
  for (let i = 0; i < 3; i++) {
    d[2 * i] = state.vel[2 * i];
    d[2 * i + 1] = state.vel[2 * i + 1];
    d[6 + 2 * i] = ax[i];
    d[6 + 2 * i + 1] = ay[i];
  }
  return d;
}

function rk4Step(state, h) {
  const add = (s, d, f) => {
    const pos = new Float64Array(6), vel = new Float64Array(6);
    for (let i = 0; i < 6; i++) {
      pos[i] = s.pos[i] + f * h * d[i];
      vel[i] = s.vel[i] + f * h * d[6 + i];
    }
    return { pos, vel, m: s.m };
  };
  const k1 = derivative(state);
  const k2 = derivative(add(state, k1, 0.5));
  const k3 = derivative(add(state, k2, 0.5));
  const k4 = derivative(add(state, k3, 1.0));
  const pos = new Float64Array(6), vel = new Float64Array(6);
  for (let i = 0; i < 6; i++) {
    pos[i] = state.pos[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    vel[i] = state.vel[i] + (h / 6) * (k1[6 + i] + 2 * k2[6 + i] + 2 * k3[6 + i] + k4[6 + i]);
  }
  return { pos, vel, m: state.m };
}

function minPairDistance(state) {
  let dmin = Infinity;
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const dx = state.pos[2 * j] - state.pos[2 * i];
      const dy = state.pos[2 * j + 1] - state.pos[2 * i + 1];
      dmin = Math.min(dmin, Math.hypot(dx, dy));
    }
  }
  return dmin;
}

function totalEnergy(state) {
  let E = 0;
  for (let i = 0; i < 3; i++) {
    E += 0.5 * state.m[i] * (state.vel[2 * i] ** 2 + state.vel[2 * i + 1] ** 2);
  }
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const dx = state.pos[2 * j] - state.pos[2 * i];
      const dy = state.pos[2 * j + 1] - state.pos[2 * i + 1];
      E -= (G * state.m[i] * state.m[j]) / Math.hypot(dx, dy);
    }
  }
  return E;
}

function bodiesToState(bodies) {
  const pos = new Float64Array(6), vel = new Float64Array(6);
  const m = bodies.map((b) => b.m);
  bodies.forEach((b, i) => {
    pos[2 * i] = b.x; pos[2 * i + 1] = b.y;
    vel[2 * i] = b.vx; vel[2 * i + 1] = b.vy;
  });
  return { pos, vel, m };
}

// ---------- メインコンポーネント ----------
export default function ThreeBodySimulator() {
  const canvasRef = useRef(null);
  const starsRef = useRef(null);

  const stateRef = useRef(bodiesToState(presetRandom()));
  const trailsRef = useRef([[], [], []]);
  const timeRef = useRef(0);
  const E0Ref = useRef(totalEnergy(stateRef.current));
  const camRef = useRef({ x: 0, y: 0, scale: 120 });
  const rafRef = useRef(0);
  const runningRef = useRef(true);
  const speedRef = useRef(1);
  const trailLenRef = useRef(1400);
  const recorderRef = useRef(null);

  const [running, setRunning] = useState(true);
  const [preset, setPreset] = useState("random");
  const [speed, setSpeed] = useState(1);
  const [trailLen, setTrailLen] = useState(1400);
  const [hud, setHud] = useState({ t: 0, drift: 0 });
  const [recording, setRecording] = useState(false);

  // 初期条件のロード
  const loadPreset = useCallback((key) => {
    const bodies = PRESETS[key].fn();
    stateRef.current = bodiesToState(bodies);
    trailsRef.current = [[], [], []];
    timeRef.current = 0;
    E0Ref.current = totalEnergy(stateRef.current);
    // カメラを初期配置に合わせる
    let ext = 0.1;
    bodies.forEach((b) => (ext = Math.max(ext, Math.abs(b.x), Math.abs(b.y))));
    const c = canvasRef.current;
    if (c) camRef.current = { x: 0, y: 0, scale: Math.min(c.clientWidth, c.clientHeight) / (ext * 3.2) };
  }, []);

  // 星空(静的背景)を生成
  const buildStars = useCallback((w, h) => {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    grad.addColorStop(0, "#0A0E22");
    grad.addColorStop(1, "#03040C");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const n = Math.floor((w * h) / 5000);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const r = Math.random() ** 3 * 1.3 + 0.2;
      const a = 0.15 + Math.random() * 0.55;
      ctx.fillStyle = `rgba(${200 + Math.random() * 55},${205 + Math.random() * 50},255,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    starsRef.current = cv;
  }, []);

  // メインループ
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      buildStars(w * dpr, h * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let frameCount = 0;

    const frame = () => {
      const W = canvas.width, H = canvas.height;
      const w = canvas.clientWidth, h = canvas.clientHeight;

      // ---- 物理積分(適応刻み)----
      if (runningRef.current) {
        let remaining = 0.012 * speedRef.current; // 1フレームあたりのシミュレーション時間
        let guard = 0;
        while (remaining > 1e-9 && guard < 600) {
          const dmin = minPairDistance(stateRef.current);
          // 近接遭遇時は刻み幅を縮小: h ∝ d^1.5(ケプラー的スケーリング)
          let hStep = 2.5e-3 * Math.min(1, Math.pow(dmin / 0.5, 1.5));
          hStep = Math.max(hStep, 2e-7);
          hStep = Math.min(hStep, remaining);
          stateRef.current = rk4Step(stateRef.current, hStep);
          timeRef.current += hStep;
          remaining -= hStep;
          guard++;
        }
        // 軌跡の記録(フレームごとに1点)
        const s = stateRef.current;
        const maxLen = trailLenRef.current;
        for (let i = 0; i < 3; i++) {
          const tr = trailsRef.current[i];
          tr.push([s.pos[2 * i], s.pos[2 * i + 1]]);
          while (tr.length > maxLen) tr.shift();
        }
      }

      // ---- カメラ(滑らかな自動追尾)----
      const s = stateRef.current;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < 3; i++) {
        minX = Math.min(minX, s.pos[2 * i]); maxX = Math.max(maxX, s.pos[2 * i]);
        minY = Math.min(minY, s.pos[2 * i + 1]); maxY = Math.max(maxY, s.pos[2 * i + 1]);
      }
      const ext = Math.max(maxX - minX, maxY - minY, 0.8);
      const targetScale = Math.min(w, h) / (ext * 1.9);
      const targetX = (minX + maxX) / 2, targetY = (minY + maxY) / 2;
      const cam = camRef.current;
      const k = 0.04;
      cam.x += (targetX - cam.x) * k;
      cam.y += (targetY - cam.y) * k;
      cam.scale += (targetScale - cam.scale) * k * 0.7;

      const toScreen = (x, y) => [
        (w / 2 + (x - cam.x) * cam.scale) * dpr,
        (h / 2 - (y - cam.y) * cam.scale) * dpr,
      ];

      // ---- 描画 ----
      ctx.globalCompositeOperation = "source-over";
      if (starsRef.current) ctx.drawImage(starsRef.current, 0, 0, W, H);
      else { ctx.fillStyle = "#04050E"; ctx.fillRect(0, 0, W, H); }

      // 軌跡(加算合成による発光)
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let b = 0; b < 3; b++) {
        const tr = trailsRef.current[b];
        if (tr.length < 2) continue;
        const col = BODY_COLORS[b];
        const N = tr.length;
        const chunk = 6; // 数セグメントごとに透明度を更新して描画コストを抑制
        for (let i = 1; i < N; i += chunk) {
          const t = i / N;
          const alpha = Math.pow(t, 2.2) * 0.85;
          if (alpha < 0.01) continue;
          ctx.strokeStyle = col;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = (0.5 + t * 1.7) * dpr;
          ctx.beginPath();
          const [sx, sy] = toScreen(tr[i - 1][0], tr[i - 1][1]);
          ctx.moveTo(sx, sy);
          for (let j = i; j < Math.min(i + chunk, N); j++) {
            const [px, py] = toScreen(tr[j][0], tr[j][1]);
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // 天体(放射状グラデーションの発光球)
      for (let b = 0; b < 3; b++) {
        const [sx, sy] = toScreen(s.pos[2 * b], s.pos[2 * b + 1]);
        const r = (3.5 + Math.cbrt(s.m[b]) * 3.5) * dpr * Math.min(1, cam.scale / 90 + 0.55);
        const col = BODY_COLORS[b];
        // 外側のハロー
        const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 6);
        halo.addColorStop(0, col + "55");
        halo.addColorStop(0.4, col + "18");
        halo.addColorStop(1, col + "00");
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(sx, sy, r * 6, 0, Math.PI * 2); ctx.fill();
        // 本体
        const core = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, 0, sx, sy, r);
        core.addColorStop(0, "#FFFFFF");
        core.addColorStop(0.35, col);
        core.addColorStop(1, col + "AA");
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // HUD更新(毎フレームのsetStateを避ける)
      frameCount++;
      if (frameCount % 12 === 0) {
        const E = totalEnergy(stateRef.current);
        const drift = Math.abs((E - E0Ref.current) / E0Ref.current);
        setHud({ t: timeRef.current, drift });
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [buildStars]);

  // ref同期
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { trailLenRef.current = trailLen; }, [trailLen]);

  const handlePreset = (key) => {
    setPreset(key);
    loadPreset(key);
    setRunning(true);
  };

  // WebM動画として録画
  const toggleRecord = () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = canvasRef.current.captureStream(60);
      const rec = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9" : "video/webm",
        videoBitsPerSecond: 8_000_000,
      });
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "three-body-simulation.webm";
        a.click();
        URL.revokeObjectURL(url);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      alert("このブラウザは録画に対応していません");
    }
  };

  const driftStr =
    hud.drift < 1e-12 ? "< 10⁻¹²" : hud.drift.toExponential(1).replace("e-", "×10⁻");

  // ---------- UI ----------
  const S = styles;
  return (
    <div style={S.root}>
      <canvas ref={canvasRef} style={S.canvas} />

      {/* 観測装置風ヘッダー */}
      <header style={S.header}>
        <h1 style={S.title}>三体問題</h1>
        <p style={S.subtitle}>カオス軌道シミュレーター</p>
        <div style={S.readout}>
          <div style={S.readoutRow}>
            <span style={S.readoutLabel}>積分法</span>
            <span style={S.readoutValue}>RK4 + 適応刻み</span>
          </div>
          <div style={S.readoutRow}>
            <span style={S.readoutLabel}>時刻 t</span>
            <span style={S.readoutValue}>{hud.t.toFixed(2)}</span>
          </div>
          <div style={S.readoutRow}>
            <span style={S.readoutLabel}>|ΔE/E₀|</span>
            <span style={{ ...S.readoutValue, color: hud.drift > 1e-3 ? "#FF9A6B" : "#9FE8C8" }}>
              {driftStr}
            </span>
          </div>
        </div>
      </header>

      {/* 凡例 */}
      <div style={S.legend}>
        {BODY_NAMES.map((name, i) => (
          <div key={i} style={S.legendItem}>
            <span style={{ ...S.legendDot, background: BODY_COLORS[i], boxShadow: `0 0 8px ${BODY_COLORS[i]}` }} />
            <span style={S.legendText}>
              {name} <span style={S.legendMass}>m={stateRef.current.m[i].toFixed(1)}</span>
            </span>
          </div>
        ))}
      </div>

      {/* コントロールバー */}
      <div style={S.controls}>
        <div style={S.presetRow}>
          {Object.entries(PRESETS).map(([key, p]) => (
            <button
              key={key}
              onClick={() => handlePreset(key)}
              style={{ ...S.presetBtn, ...(preset === key ? S.presetBtnActive : {}) }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={S.controlRow}>
          <button onClick={() => setRunning((r) => !r)} style={S.iconBtn} aria-label={running ? "一時停止" : "再生"}>
            {running ? "❚❚" : "▶"}
          </button>
          <button onClick={() => handlePreset(preset)} style={S.iconBtn} aria-label="リセット">
            ↺
          </button>
          <label style={S.sliderGroup}>
            <span style={S.sliderLabel}>速度 ×{speed.toFixed(1)}</span>
            <input type="range" min={0.1} max={4} step={0.1} value={speed}
              onChange={(e) => setSpeed(+e.target.value)} style={S.slider} />
          </label>
          <label style={S.sliderGroup}>
            <span style={S.sliderLabel}>軌跡の長さ</span>
            <input type="range" min={200} max={4000} step={100} value={trailLen}
              onChange={(e) => setTrailLen(+e.target.value)} style={S.slider} />
          </label>
          <button onClick={toggleRecord}
            style={{ ...S.recordBtn, ...(recording ? S.recordBtnActive : {}) }}>
            {recording ? "● 録画停止" : "○ 動画として録画"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- スタイル ----------
const mono = "'SF Mono', 'Cascadia Mono', 'Roboto Mono', monospace";
const mincho = "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif";
const gothic = "'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif";

const styles = {
  root: {
    position: "relative", width: "100%", height: "100vh",
    overflow: "hidden", background: "#03040C", fontFamily: gothic,
  },
  canvas: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" },
  header: {
    position: "absolute", top: 24, left: 28, color: "#E8EAF6",
    pointerEvents: "none", userSelect: "none",
  },
  title: {
    margin: 0, fontFamily: mincho, fontWeight: 600, fontSize: 34,
    letterSpacing: "0.32em", color: "#F2F0E6",
    textShadow: "0 0 24px rgba(140,160,255,0.35)",
  },
  subtitle: {
    margin: "4px 0 14px", fontSize: 11, letterSpacing: "0.42em",
    color: "rgba(220,225,255,0.55)",
  },
  readout: {
    fontFamily: mono, fontSize: 11.5, lineHeight: 1.9,
    borderLeft: "1px solid rgba(160,180,255,0.25)", paddingLeft: 12,
  },
  readoutRow: { display: "flex", gap: 10 },
  readoutLabel: { color: "rgba(190,200,240,0.5)", minWidth: 64 },
  readoutValue: { color: "#C9D4FF" },
  legend: {
    position: "absolute", top: 28, right: 28, display: "flex",
    flexDirection: "column", gap: 9, userSelect: "none", pointerEvents: "none",
  },
  legendItem: { display: "flex", alignItems: "center", gap: 9, justifyContent: "flex-end" },
  legendDot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  legendText: { color: "rgba(230,235,255,0.85)", fontSize: 12.5, letterSpacing: "0.08em" },
  legendMass: { fontFamily: mono, fontSize: 10.5, color: "rgba(200,210,250,0.5)", marginLeft: 4 },
  controls: {
    position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
    display: "flex", flexDirection: "column", gap: 10, alignItems: "center",
    padding: "14px 20px", borderRadius: 16, maxWidth: "min(720px, 94vw)",
    background: "rgba(10,13,30,0.62)", backdropFilter: "blur(14px)",
    border: "1px solid rgba(150,170,255,0.14)",
    boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
  },
  presetRow: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  presetBtn: {
    padding: "6px 14px", borderRadius: 99, fontSize: 12, cursor: "pointer",
    background: "transparent", color: "rgba(215,222,255,0.7)",
    border: "1px solid rgba(160,180,255,0.22)", letterSpacing: "0.05em",
    fontFamily: gothic, transition: "all .2s",
  },
  presetBtnActive: {
    background: "rgba(140,165,255,0.16)", color: "#EDF1FF",
    border: "1px solid rgba(170,190,255,0.55)",
  },
  controlRow: { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "center" },
  iconBtn: {
    width: 38, height: 38, borderRadius: "50%", cursor: "pointer", fontSize: 13,
    background: "rgba(140,165,255,0.12)", color: "#E8ECFF",
    border: "1px solid rgba(160,180,255,0.3)",
  },
  sliderGroup: { display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" },
  sliderLabel: { fontSize: 10.5, color: "rgba(200,210,245,0.6)", fontFamily: mono, letterSpacing: "0.05em" },
  slider: { width: 130, accentColor: "#8FA5FF", cursor: "pointer" },
  recordBtn: {
    padding: "8px 16px", borderRadius: 99, fontSize: 12, cursor: "pointer",
    background: "transparent", color: "rgba(255,170,170,0.85)",
    border: "1px solid rgba(255,140,140,0.35)", letterSpacing: "0.06em",
    fontFamily: gothic,
  },
  recordBtnActive: {
    background: "rgba(255,80,80,0.18)", color: "#FFD6D6",
    border: "1px solid rgba(255,110,110,0.7)",
  },
};
