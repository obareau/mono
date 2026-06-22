import type { Filter } from "./types";

// Mezzotint — stochastic random-dot screening, the intaglio grain. Each pixel is thresholded
// against value noise; at grain 1 it's pure random speckle, larger grain clumps into a
// coarser mezzotint tooth. A contrast control hardens or softens the grain.

function hash2(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 53.7) * 43758.5453;
  return s - Math.floor(s);
}

// smooth value noise: bilinear-interpolated hash lattice at the given cell size
function vnoise(x: number, y: number, grain: number, seed: number): number {
  if (grain <= 1) return hash2(Math.floor(x), Math.floor(y), seed);
  const gx = x / grain, gy = y / grain;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

export const mezzotint: Filter = {
  id: "mezzotint",
  name: "Mezzotint",
  category: "dither",
  params: [
    { key: "grain", label: "Grain", type: "range", default: 1, min: 1, max: 20, step: 1 },
    { key: "contrast", label: "Contrast", type: "range", default: 1, min: 0.3, max: 3, step: 0.01 },
    { key: "level", label: "Level", type: "range", default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: "seed", label: "Seed", type: "range", default: 1, min: 1, max: 999, step: 1 },
  ],
  apply(gray, w, h, p) {
    const grain = Math.max(1, Math.round(p.grain as number));
    const contrast = p.contrast as number;
    const bias = (p.level as number) - 0.5;
    const seed = p.seed as number;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let t = vnoise(x, y, grain, seed);
        t = 0.5 + (t - 0.5) * contrast; // harden/soften the grain distribution
        gray[y * w + x] = gray[y * w + x] + bias >= t ? 1 : 0;
      }
    }
    return gray;
  },
};
