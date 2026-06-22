import type { Filter } from "./types";

// Truchet tiles — the image is laid out as a grid of square tiles, each randomly oriented,
// carrying arcs or diagonals that connect edge midpoints. Line thickness tracks local tone,
// so the maze-like weave darkens in the shadows. Very graphic, zine / Amiga.

function hash2(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 53.7) * 43758.5453;
  return s - Math.floor(s);
}

export const truchet: Filter = {
  id: "truchet",
  name: "Truchet",
  category: "geometry",
  params: [
    { key: "cell", label: "Tile px", type: "range", default: 18, min: 4, max: 64, step: 1 },
    { key: "mode", label: "Mode", type: "select", default: "arcs", options: ["arcs", "lines"] },
    { key: "weight", label: "Weight", type: "range", default: 1, min: 0.2, max: 2, step: 0.01 },
    { key: "seed", label: "Seed", type: "range", default: 1, min: 1, max: 999, step: 1 },
  ],
  apply(gray, w, h, p) {
    const s = Math.max(3, Math.round(p.cell as number));
    const arcs = (p.mode as string) === "arcs";
    const weight = p.weight as number;
    const seed = p.seed as number;
    const r = s / 2;
    const SQRT2 = Math.SQRT2;
    const out = new Float32Array(gray.length).fill(1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cxi = Math.floor(x / s), cyi = Math.floor(y / s);
        const lx = x - cxi * s, ly = y - cyi * s;
        // tone from the tile centre -> uniform thickness per tile
        const sx = Math.min(w - 1, cxi * s + (s >> 1)), sy = Math.min(h - 1, cyi * s + (s >> 1));
        const ink = Math.min(1, Math.max(0, (1 - gray[sy * w + sx]) * weight));
        if (ink <= 0.01) continue;
        const half = (ink * s * 0.42) / 2 + 0.5;
        const flip = hash2(cxi, cyi, seed) > 0.5;
        let dist: number;
        if (arcs) {
          if (!flip) dist = Math.min(Math.abs(Math.hypot(lx, ly) - r), Math.abs(Math.hypot(lx - s, ly - s) - r));
          else dist = Math.min(Math.abs(Math.hypot(lx - s, ly) - r), Math.abs(Math.hypot(lx, ly - s) - r));
        } else {
          if (!flip) dist = Math.abs(lx - ly) / SQRT2;
          else dist = Math.abs(lx + ly - s) / SQRT2;
        }
        if (dist < half) out[y * w + x] = 0;
      }
    }
    return out;
  },
};
