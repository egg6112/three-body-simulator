# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Single-file React component (`three-body-simulator.jsx`) that simulates the three-body gravitational problem in a browser canvas. No build system exists yet — the file is meant to be embedded in a React app (e.g. Vite + React) or dropped into a sandbox like StackBlitz/CodeSandbox.

## Architecture

Everything lives in one file with three logical layers:

**1. Physics engine (pure functions, no React)**
- `bodiesToState` converts body objects → typed `Float64Array` state `{ pos[6], vel[6], m[3] }`
- `computeAccel` → `derivative` → `rk4Step`: classic RK4 integrator over that flat state
- Adaptive step size in the render loop: step size scales as `d^1.5` when bodies approach (Kepler-inspired), guarded by a 600-iteration cap per frame
- `totalEnergy` computes total mechanical energy; drift `|ΔE/E₀|` is shown in the HUD as a numerical accuracy indicator

**2. Preset initial conditions**
- `presetRandom`: random positions on a circle, momentum-zeroed in the center-of-mass frame
- `presetFigureEight`: Chenciner–Montgomery (2000) figure-eight periodic orbit
- `presetLagrange`: Lagrange equilateral triangle with a tiny perturbation to expose instability
- `presetPythagorean`: Burrau's 3:4:5 mass problem (starts at rest, violent close encounters)

**3. React component (`ThreeBodySimulator`)**
- Uses `useRef` for all mutable simulation state (physics state, trails, camera, timers) — avoids re-renders during the animation loop
- Uses `useState` only for UI-driven values (running, preset key, speed, trailLen) and the HUD readout (updated every 12 frames via `setHud`)
- Three `useEffect` syncs keep `runningRef`, `speedRef`, `trailLenRef` in sync with their state counterparts so the RAF loop always reads current values without closure staleness
- The main RAF loop lives in a single `useEffect([buildStars])` and handles: physics integration, auto-tracking camera (exponential smoothing), canvas 2D rendering, and MediaRecorder-based WebM export

**Rendering pipeline (canvas 2D)**
1. Static star-field background drawn to an offscreen canvas (`starsRef`) on resize, then `drawImage`-blitted each frame
2. Trails rendered with `globalCompositeOperation = "lighter"` (additive blending) in fixed-size chunks for performance; opacity and line width scale with trail age
3. Bodies drawn as radial-gradient spheres with a halo pass
4. All coordinates go through `toScreen(x, y)` which applies the camera transform (center + scale, Y-flipped)

## To add a build/deploy setup

This project has no `package.json` yet. To run locally:

```bash
npm create vite@latest . -- --template react
npm install
# replace src/App.jsx content with: import ThreeBodySimulator from "./three-body-simulator"; export default function App() { return <ThreeBodySimulator />; }
npm run dev
```

To deploy to GitHub Pages after setting up Vite:

```bash
npm run build          # outputs to dist/
# configure vite.config.js: base: '/three-body-simulator/'
# then push dist/ to gh-pages branch, or use gh-pages npm package
```
