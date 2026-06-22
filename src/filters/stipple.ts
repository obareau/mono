import type { Filter, VecPrim } from "./types";

// Stippling — the image rendered as ink dots. A jittered grid gives each cell one dot; in
// "size" mode the dot radius tracks local darkness (FM-ish halftone), in "density" mode a
// dot is kept only where it's dark enough (true stipple). Exports cleanly to SVG/PDF.

function hash2(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 53.7) * 43758.5453;
  return s - Math.floor(s);
}

interface Dot { cx: number; cy: number; r: number }

// Variable-radius Poisson-disk sampling (Bridson). The exclusion radius shrinks in dark
// areas (more dots) and grows in light ones, giving an even, blue-noise stipple that follows
// tone — the classic hand-stippled look, far nicer than a jittered grid.
function poissonDots(gray: Float32Array, w: number, h: number, p: Record<string, number | string | boolean>): Dot[] {
  const maxR = Math.max(2, p.spacing as number);
  const minR = Math.max(1, maxR * 0.3);
  const dotR = (p.dotSize as number) * 0.5;
  const contrast = p.contrast as number;
  let s = (((p.seed as number) >>> 0) * 2654435761) >>> 0 || 1;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rAt = (x: number, y: number) => {
    const xi = Math.min(w - 1, Math.max(0, x | 0));
    const yi = Math.min(h - 1, Math.max(0, y | 0));
    return minR + (maxR - minR) * Math.pow(gray[yi * w + xi], contrast);
  };
  const cell = maxR / 2;
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const grid: number[][] = Array.from({ length: gw * gh }, () => []);
  const px: number[] = [], py: number[] = [];
  const active: number[] = [];
  const add = (x: number, y: number) => {
    const id = px.length;
    px.push(x); py.push(y);
    grid[((y / cell) | 0) * gw + ((x / cell) | 0)].push(id);
    active.push(id);
  };
  add(rnd() * w, rnd() * h);
  const K = 20;
  while (active.length) {
    const ai = (rnd() * active.length) | 0;
    const ox = px[active[ai]], oy = py[active[ai]];
    let placed = false;
    for (let i = 0; i < K; i++) {
      const ang = rnd() * Math.PI * 2;
      const rr = rAt(ox, oy);
      const dist = rr + rnd() * rr; // candidate in annulus [r, 2r)
      const nx = ox + Math.cos(ang) * dist, ny = oy + Math.sin(ang) * dist;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const rc = rAt(nx, ny);
      const cgx = (nx / cell) | 0, cgy = (ny / cell) | 0;
      const span = Math.ceil(rc / cell) + 1;
      let ok = true;
      for (let gy = Math.max(0, cgy - span); gy <= Math.min(gh - 1, cgy + span) && ok; gy++) {
        for (let gx = Math.max(0, cgx - span); gx <= Math.min(gw - 1, cgx + span) && ok; gx++) {
          for (const id of grid[gy * gw + gx]) {
            const dx = nx - px[id], dy = ny - py[id];
            if (dx * dx + dy * dy < rc * rc) { ok = false; break; }
          }
        }
      }
      if (ok) { add(nx, ny); placed = true; break; }
    }
    if (!placed) { active[ai] = active[active.length - 1]; active.pop(); }
  }
  const out: Dot[] = [];
  for (let i = 0; i < px.length; i++) out.push({ cx: px[i], cy: py[i], r: dotR });
  return out;
}

function dots(gray: Float32Array, w: number, h: number, p: Record<string, number | string | boolean>): Dot[] {
  if ((p.mode as string) === "poisson") return poissonDots(gray, w, h, p);
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
    { key: "mode", label: "Mode", type: "select", default: "size", options: ["size", "density", "poisson"] },
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
