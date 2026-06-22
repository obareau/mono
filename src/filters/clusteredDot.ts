import type { Filter } from "./types";

// Clustered-dot ordered dither (AM screening). Thresholds spiral outward from two dot
// centres per tile, so ink forms growing dots like a real halftone press screen — but
// locked to the pixel grid (no interpolation), giving that crisp printed look.

// Classic 8x8 clustered-dot screen (Ulichney), values 0..63, two dots per tile.
// prettier-ignore
const M8 = [
  [24, 10, 12, 26, 35, 47, 49, 37],
  [ 8,  0,  2, 14, 45, 59, 61, 51],
  [22,  6,  4, 16, 43, 57, 63, 53],
  [30, 20, 18, 28, 33, 41, 55, 39],
  [34, 46, 48, 38, 25, 11, 13, 27],
  [44, 58, 60, 50,  9,  1,  3, 15],
  [42, 56, 62, 52, 23,  7,  5, 17],
  [32, 40, 54, 36, 31, 21, 19, 29],
];

export const clusteredDot: Filter = {
  id: "clustered-dot",
  name: "Clustered Dot",
  category: "screen",
  params: [
    { key: "scale", label: "Scale", type: "range", default: 1, min: 1, max: 6, step: 1 },
    { key: "bias", label: "Bias", type: "range", default: 0, min: -0.5, max: 0.5, step: 0.01 },
  ],
  apply(gray, w, h, p) {
    const scale = Math.max(1, Math.round(p.scale as number));
    const bias = p.bias as number;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const mx = Math.floor(x / scale) & 7;
        const my = Math.floor(y / scale) & 7;
        const t = (M8[my][mx] + 0.5) / 64 + bias;
        gray[i] = gray[i] >= t ? 1 : 0;
      }
    }
    return gray;
  },
  // Vector: AM dot screen at 0°. The 8×8 tile holds ~2 dots, so the dot period is 4·scale.
  toVector(gray, w, h, p) {
    const scale = Math.max(1, Math.round(p.scale as number));
    const period = 4 * scale;
    const prims: import("./types").VecPrim[] = [];
    for (let by = 0; by < h; by += period) {
      for (let bx = 0; bx < w; bx += period) {
        let sum = 0, n = 0;
        const ey = Math.min(h, by + period), ex = Math.min(w, bx + period);
        for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { sum += gray[y * w + x]; n++; }
        const ink = 1 - (n ? sum / n : 1);
        const r = Math.sqrt(Math.max(0, ink)) * period * 0.62;
        if (r > 0.15) prims.push({ t: "circle", cx: bx + period / 2, cy: by + period / 2, r });
      }
    }
    return { w, h, prims };
  },
};
