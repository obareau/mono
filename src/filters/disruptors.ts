import type { Filter } from "./types";

// Disruptors — ported from terminal-synth's industrialDisruptors.ts (a real-time VJ tool).
// There they are audio-reactive GLSL events using prev()/fb()/u_time/u_bass. Here MONO° is
// a still-image pipeline, so the spatially-meaningful ones are re-expressed as deterministic
// CPU filters on the grayscale buffer, with `amount`/`seed` standing in for audio + time.
// (Frame-feedback ones — Datamosh, Frame Hold, Sync Lost — are skipped: no temporal context.)

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function sampleClamp(g: Float32Array, w: number, h: number, x: number, y: number): number {
  const xi = x < 0 ? 0 : x >= w ? w - 1 : x | 0;
  const yi = y < 0 ? 0 : y >= h ? h - 1 : y | 0;
  return g[yi * w + xi];
}

// 1. BLOCK DISPLACE — bass kick → grid cell shift
const blockDisplace: Filter = {
  id: "block-displace",
  name: "Block Displace",
  category: "disrupt",
  params: [
    { key: "amount", label: "Amount", type: "range", default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: "cell", label: "Cell px", type: "range", default: 24, min: 4, max: 96, step: 1 },
    { key: "seed", label: "Seed", type: "range", default: 1, min: 1, max: 999, step: 1 },
    { key: "speed", label: "Speed", type: "range", default: 0, min: 0, max: 30, step: 0.5 },
  ],
  apply(gray, w, h, p, ctx) {
    const a = p.amount as number;
    const cell = p.cell as number;
    const seed = (p.seed as number) + Math.floor(ctx.time * (p.speed as number));
    const out = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cx = Math.floor(x / cell);
        const cy = Math.floor(y / cell);
        const r = hash2(cx + seed, cy + seed);
        let sx = x;
        let sy = y;
        if (r > 0.55) {
          sx = x + (r - 0.5) * 0.1 * a * w;
          sy = y + (hash2(cy + seed + r, cx + seed) - 0.5) * 0.1 * a * h;
        }
        out[y * w + x] = sampleClamp(gray, w, h, sx, sy);
      }
    }
    return out;
  },
};

// 7. BIT CRUSH — luminance quantized to N levels
const bitCrush: Filter = {
  id: "bit-crush",
  name: "Bit Crush",
  category: "disrupt",
  params: [
    { key: "levels", label: "Levels", type: "range", default: 4, min: 2, max: 16, step: 1 },
    { key: "amount", label: "Amount", type: "range", default: 1, min: 0, max: 1, step: 0.01 },
  ],
  apply(gray, _w, _h, p) {
    const levels = Math.max(2, Math.round(p.levels as number));
    const a = p.amount as number;
    const step = levels - 1;
    for (let i = 0; i < gray.length; i++) {
      const q = Math.round(gray[i] * step) / step;
      gray[i] = gray[i] + (q - gray[i]) * a;
    }
    return gray;
  },
};

// 8. GLYPH STORM — burst of monospace glyph (plus-sign) overlay
const glyphStorm: Filter = {
  id: "glyph-storm",
  name: "Glyph Storm",
  category: "disrupt",
  params: [
    { key: "amount", label: "Amount", type: "range", default: 0.85, min: 0, max: 1, step: 0.01 },
    { key: "columns", label: "Columns", type: "range", default: 80, min: 20, max: 200, step: 1 },
    { key: "density", label: "Density", type: "range", default: 0.22, min: 0, max: 1, step: 0.01 },
    { key: "seed", label: "Seed", type: "range", default: 1, min: 1, max: 999, step: 1 },
    { key: "speed", label: "Speed", type: "range", default: 0, min: 0, max: 30, step: 0.5 },
  ],
  apply(gray, w, h, p, ctx) {
    const a = p.amount as number;
    const cols = Math.round(p.columns as number);
    const rows = Math.max(1, Math.round((cols * h) / w));
    const thresh = 1 - (p.density as number);
    const seed = (p.seed as number) + Math.floor(ctx.time * (p.speed as number));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = (x / w) * cols;
        const gy = (y / h) * rows;
        const seedv = hash2(Math.floor(gx) + seed, Math.floor(gy) + seed);
        if (seedv <= thresh) continue;
        const cux = Math.abs(gx - Math.floor(gx) - 0.5);
        const cuy = Math.abs(gy - Math.floor(gy) - 0.5);
        const hbar = 1 - smoothstep(0.08, 0.12, cuy);
        const vbar = 1 - smoothstep(0.08, 0.12, cux);
        const glyph = Math.max(hbar, vbar) * (1 - smoothstep(0.32, 0.38, Math.max(cux, cuy)));
        const i = y * w + x;
        gray[i] = gray[i] + (glyph - gray[i]) * a * 0.85;
      }
    }
    return gray;
  },
};

// 10. SCANLINE DENSITY — pulsing CRT scanlines
const scanlines: Filter = {
  id: "scanlines",
  name: "Scanlines",
  category: "disrupt",
  params: [
    { key: "amount", label: "Amount", type: "range", default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: "density", label: "Lines", type: "range", default: 300, min: 40, max: 900, step: 1 },
    { key: "phase", label: "Phase", type: "range", default: 0, min: 0, max: 6.28, step: 0.01 },
    { key: "speed", label: "Speed", type: "range", default: 0, min: 0, max: 20, step: 0.1 },
  ],
  apply(gray, w, h, p, ctx) {
    const a = p.amount as number;
    const density = p.density as number;
    const phase = (p.phase as number) + ctx.time * (p.speed as number);
    for (let y = 0; y < h; y++) {
      const scan = 0.5 + 0.5 * Math.sin((y / h) * density + phase);
      const k = 1 + (scan - 1) * a * 0.85;
      for (let x = 0; x < w; x++) gray[y * w + x] *= k;
    }
    return gray;
  },
};

// 11. CONTOUR SHOCK — edge-detection flash
const contourShock: Filter = {
  id: "contour-shock",
  name: "Contour Shock",
  category: "disrupt",
  params: [
    { key: "amount", label: "Amount", type: "range", default: 1, min: 0, max: 1, step: 0.01 },
    { key: "gain", label: "Gain", type: "range", default: 6, min: 1, max: 20, step: 0.1 },
    { key: "invert", label: "Invert", type: "toggle", default: false },
  ],
  apply(gray, w, h, p) {
    const a = p.amount as number;
    const gain = p.gain as number;
    const inv = p.invert as boolean;
    const out = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const lc = gray[y * w + x];
        const lx = sampleClamp(gray, w, h, x + 1, y);
        const ly = sampleClamp(gray, w, h, x, y + 1);
        let edge = Math.min(1, (Math.abs(lc - lx) + Math.abs(lc - ly)) * gain);
        if (inv) edge = 1 - edge;
        out[y * w + x] = lc + (edge - lc) * a;
      }
    }
    return out;
  },
};

// 2. SCAN TEAR — horizontal band offset
const scanTear: Filter = {
  id: "scan-tear",
  name: "Scan Tear",
  category: "disrupt",
  params: [
    { key: "amount", label: "Amount", type: "range", default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: "bands", label: "Bands", type: "range", default: 40, min: 4, max: 160, step: 1 },
    { key: "threshold", label: "Threshold", type: "range", default: 0.78, min: 0, max: 1, step: 0.01 },
    { key: "seed", label: "Seed", type: "range", default: 1, min: 1, max: 999, step: 1 },
    { key: "speed", label: "Speed", type: "range", default: 0, min: 0, max: 30, step: 0.5 },
  ],
  apply(gray, w, h, p, ctx) {
    const a = p.amount as number;
    const bands = p.bands as number;
    const thr = p.threshold as number;
    const seed = (p.seed as number) + Math.floor(ctx.time * (p.speed as number));
    const out = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) {
      const band = Math.floor((y / h) * bands);
      const s = hash2(band, seed);
      const tear = (s > thr ? 1 : 0) * (s - 0.5) * 0.25 * a;
      const shift = Math.round(tear * w);
      for (let x = 0; x < w; x++) {
        const sx = ((x + shift) % w + w) % w;
        out[y * w + x] = gray[y * w + sx];
      }
    }
    return out;
  },
};

export const DISRUPTORS: Filter[] = [
  blockDisplace,
  bitCrush,
  glyphStorm,
  scanlines,
  contourShock,
  scanTear,
];
