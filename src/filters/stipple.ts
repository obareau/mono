import type { Filter, VecPrim } from "./types";

// Stippling — the image rendered as ink dots. A jittered grid gives each cell one dot; in
// "size" mode the dot radius tracks local darkness (FM-ish halftone), in "density" mode a
// dot is kept only where it's dark enough (true stipple). Exports cleanly to SVG/PDF.

function hash2(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 53.7) * 43758.5453;
  return s - Math.floor(s);
}

interface Dot { cx: number; cy: number; r: number }

function dots(gray: Float32Array, w: number, h: number, p: Record<string, number | string | boolean>): Dot[] {
  const spacing = Math.max(2, p.spacing as number);
  const dotSize = p.dotSize as number;
  const jit = (p.jitter as number) * spacing;
  const contrast = p.contrast as number;
  const mode = p.mode as string;
  const seed = p.seed as number;
  const out: Dot[] = [];
  for (let gy = 0; gy * spacing < h; gy++) {
    for (let gx = 0; gx * spacing < w; gx++) {
      const jx = (hash2(gx, gy, seed) - 0.5) * jit;
      const jy = (hash2(gx + 31, gy + 17, seed) - 0.5) * jit;
      const cx = (gx + 0.5) * spacing + jx;
      const cy = (gy + 0.5) * spacing + jy;
      if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
      const ink = Math.pow(1 - gray[(cy | 0) * w + (cx | 0)], contrast);
      if (mode === "density") {
        if (hash2(gx + 7, gy + 53, seed) < ink) out.push({ cx, cy, r: dotSize * 0.5 });
      } else {
        const r = ink * dotSize * 0.5;
        if (r > 0.15) out.push({ cx, cy, r });
      }
    }
  }
  return out;
}

export const stipple: Filter = {
  id: "stipple",
  name: "Stipple",
  category: "screen",
  params: [
    { key: "mode", label: "Mode", type: "select", default: "size", options: ["size", "density"] },
    { key: "spacing", label: "Spacing", type: "range", default: 8, min: 2, max: 40, step: 1 },
    { key: "dotSize", label: "Dot size", type: "range", default: 7, min: 1, max: 40, step: 0.5 },
    { key: "jitter", label: "Jitter", type: "range", default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: "contrast", label: "Contrast", type: "range", default: 1, min: 0.3, max: 3, step: 0.01 },
    { key: "seed", label: "Seed", type: "range", default: 1, min: 1, max: 999, step: 1 },
  ],
  apply(gray, w, h, p) {
    const out = new Float32Array(gray.length).fill(1); // white ground
    for (const d of dots(gray, w, h, p)) {
      const r = d.r;
      const x0 = Math.max(0, Math.floor(d.cx - r)), x1 = Math.min(w - 1, Math.ceil(d.cx + r));
      const y0 = Math.max(0, Math.floor(d.cy - r)), y1 = Math.min(h - 1, Math.ceil(d.cy + r));
      const r2 = r * r;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - d.cx, dy = y - d.cy;
          if (dx * dx + dy * dy <= r2) out[y * w + x] = 0; // ink
        }
      }
    }
    return out;
  },
  toVector(gray, w, h, p) {
    const prims: VecPrim[] = dots(gray, w, h, p).map((d) => ({ t: "circle", cx: d.cx, cy: d.cy, r: d.r }));
    return { w, h, prims };
  },
};
