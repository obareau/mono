import type { Filter } from "./types";

// Riemersma dithering: error diffusion along a Hilbert space-filling curve instead of
// scanlines. Because the curve keeps neighbouring samples spatially close, error spreads
// in all directions and the result has a distinctive isotropic, slightly woven grain with
// no directional scanline artefacts.

// Hilbert curve mapping: distance d -> (x, y) on an n*n grid (n a power of two).
function d2xy(n: number, d: number): [number, number] {
  let rx: number;
  let ry: number;
  let t = d;
  let x = 0;
  let y = 0;
  for (let s = 1; s < n; s *= 2) {
    rx = 1 & (t >> 1);
    ry = 1 & (t ^ rx);
    // rotate quadrant
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const tmp = x;
      x = y;
      y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t >>= 2;
  }
  return [x, y];
}

export const riemersma: Filter = {
  id: "riemersma",
  name: "Riemersma",
  category: "dither",
  params: [
    { key: "level", label: "Level", type: "range", default: 0.5, min: 0.05, max: 0.95, step: 0.01 },
    { key: "history", label: "History", type: "range", default: 16, min: 4, max: 32, step: 1 },
    { key: "decay", label: "Decay", type: "range", default: 16, min: 2, max: 64, step: 1 },
  ],
  apply(gray, w, h, p) {
    const level = p.level as number;
    const M = Math.round(p.history as number);
    const ratio = p.decay as number; // oldest weight = newest / ratio

    // weights by age (0 = most recent), geometric decay
    const weights = new Float32Array(M);
    let wsum = 0;
    for (let a = 0; a < M; a++) {
      weights[a] = Math.pow(1 / ratio, a / (M - 1));
      wsum += weights[a];
    }

    const n = 1 << Math.ceil(Math.log2(Math.max(w, h, 2)));
    const hist = new Float32Array(M); // ring buffer of recent errors
    let head = 0;

    for (let d = 0; d < n * n; d++) {
      const [x, y] = d2xy(n, d);
      if (x >= w || y >= h) continue;
      const i = y * w + x;

      // weighted sum of recent errors
      let acc = 0;
      for (let a = 0; a < M; a++) {
        acc += hist[(head - 1 - a + M * 2) % M] * weights[a];
      }
      const val = gray[i] + acc / wsum;
      const out = val >= level ? 1 : 0;
      gray[i] = out;

      hist[head] = val - out;
      head = (head + 1) % M;
    }
    return gray;
  },
};
