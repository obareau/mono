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
};
