import type { Filter } from "./types";

// Ordered (Bayer) dithering — the stable, structured screens you see in classic
// 1-bit paint programs. Threshold comes from a recursively-built Bayer matrix.

function bayerMatrix(n: number): number[][] {
  if (n === 1) return [[0]];
  const prev = bayerMatrix(n / 2);
  const size = n;
  const half = n / 2;
  const m: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < half; x++) {
      const base = prev[y][x] * 4;
      m[y][x] = base + 0;
      m[y][x + half] = base + 2;
      m[y + half][x] = base + 3;
      m[y + half][x + half] = base + 1;
    }
  }
  return m;
}

const CACHE: Record<number, number[][]> = {};
function matrix(size: number): number[][] {
  if (!CACHE[size]) CACHE[size] = bayerMatrix(size);
  return CACHE[size];
}

export const bayer: Filter = {
  id: "bayer",
  name: "Ordered (Bayer)",
  category: "dither",
  params: [
    { key: "size", label: "Matrix", type: "select", default: "4", options: ["2", "4", "8"] },
    { key: "bias", label: "Bias", type: "range", default: 0, min: -0.5, max: 0.5, step: 0.01 },
  ],
  apply(gray, w, h, p) {
    const n = parseInt(p.size as string, 10);
    const m = matrix(n);
    const denom = n * n;
    const bias = p.bias as number;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const t = (m[y % n][x % n] + 0.5) / denom + bias;
        gray[i] = gray[i] >= t ? 1 : 0;
      }
    }
    return gray;
  },
};
