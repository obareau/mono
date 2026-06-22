import type { Filter, VecPrim } from "./types";

// Circle packing — non-overlapping ink circles thrown at the image, kept more often where
// it's dark (so density follows tone) and grown to touch their neighbours. Reads as a lively
// tonal stipple of varied discs, and exports cleanly to SVG/PDF.

interface Disc { cx: number; cy: number; r: number }

function pack(gray: Float32Array, w: number, h: number, p: Record<string, number | string | boolean>): Disc[] {
  const minR = Math.max(1, p.minR as number);
  const maxR = Math.max(minR + 0.5, p.maxR as number);
  const contrast = p.contrast as number;
  const density = p.density as number;
  let s = (((p.seed as number) >>> 0) * 2654435761) >>> 0 || 1;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const cell = maxR;
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const grid: number[][] = Array.from({ length: gw * gh }, () => []);
  const discs: Disc[] = [];
  const attempts = Math.min(400000, Math.round(((w * h) / (minR * minR)) * density));

  for (let a = 0; a < attempts; a++) {
    const x = rnd() * w, y = rnd() * h;
    const ink = 1 - gray[(Math.min(h - 1, y | 0)) * w + Math.min(w - 1, x | 0)];
    if (rnd() > Math.pow(Math.max(0, ink), contrast)) continue; // keep more discs in the darks
    let rMax = Math.min(maxR, x, y, w - x, h - y);
    const cgx = (x / cell) | 0, cgy = (y / cell) | 0;
    for (let gy = Math.max(0, cgy - 2); gy <= Math.min(gh - 1, cgy + 2) && rMax >= minR; gy++) {
      for (let gx = Math.max(0, cgx - 2); gx <= Math.min(gw - 1, cgx + 2); gx++) {
        for (const id of grid[gy * gw + gx]) {
          const d = Math.hypot(x - discs[id].cx, y - discs[id].cy) - discs[id].r;
          if (d < rMax) rMax = d;
        }
      }
    }
    if (rMax < minR) continue;
    discs.push({ cx: x, cy: y, r: rMax * 0.95 });
    grid[cgy * gw + cgx].push(discs.length - 1);
  }
  return discs;
}

export const circlePack: Filter = {
  id: "circle-pack",
  name: "Circle Pack",
  category: "geometry",
  params: [
    { key: "minR", label: "Min R", type: "range", default: 2, min: 1, max: 12, step: 0.5 },
    { key: "maxR", label: "Max R", type: "range", default: 16, min: 4, max: 60, step: 1 },
    { key: "contrast", label: "Contrast", type: "range", default: 1.2, min: 0.3, max: 3, step: 0.01 },
    { key: "density", label: "Density", type: "range", default: 1, min: 0.3, max: 2, step: 0.01 },
    { key: "seed", label: "Seed", type: "range", default: 1, min: 1, max: 999, step: 1 },
  ],
  apply(gray, w, h, p) {
    const out = new Float32Array(gray.length).fill(1);
    for (const d of pack(gray, w, h, p)) {
      const x0 = Math.max(0, Math.floor(d.cx - d.r)), x1 = Math.min(w - 1, Math.ceil(d.cx + d.r));
      const y0 = Math.max(0, Math.floor(d.cy - d.r)), y1 = Math.min(h - 1, Math.ceil(d.cy + d.r));
      const r2 = d.r * d.r;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x - d.cx, dy = y - d.cy;
        if (dx * dx + dy * dy <= r2) out[y * w + x] = 0;
      }
    }
    return out;
  },
  toVector(gray, w, h, p) {
    const prims: VecPrim[] = pack(gray, w, h, p).map((d) => ({ t: "circle", cx: d.cx, cy: d.cy, r: d.r }));
    return { w, h, prims };
  },
};
