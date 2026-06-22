import type { Filter } from "./types";
import { getMask } from "../io/maskStore";

// Threshold-map dithering: compare each pixel against a threshold taken from a loaded image
// (the "mask") instead of a fixed value. Any image becomes a dither screen — textures, logos,
// hand-drawn patterns. Falls back to an 8×8 Bayer matrix when no mask is loaded.

// prettier-ignore
const BAYER8 = [
  [ 0,48,12,60, 3,51,15,63],[32,16,44,28,35,19,47,31],
  [ 8,56, 4,52,11,59, 7,55],[40,24,36,20,43,27,39,23],
  [ 2,50,14,62, 1,49,13,61],[34,18,46,30,33,17,45,29],
  [10,58, 6,54, 9,57, 5,53],[42,26,38,22,41,25,37,21],
];

export const thresholdMap: Filter = {
  id: "threshold-map",
  name: "Threshold Map",
  category: "dither",
  params: [
    { key: "mask", label: "Mask", type: "mask", default: "" },
    { key: "fit", label: "Fit", type: "select", default: "stretch", options: ["stretch", "tile"] },
    { key: "level", label: "Level", type: "range", default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: "invert", label: "Invert map", type: "toggle", default: false },
  ],
  apply(gray, w, h, p) {
    const mask = getMask(p.mask as string);
    const tile = (p.fit as string) === "tile";
    const invert = p.invert as boolean;
    const bias = (p.level as number) - 0.5;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let t: number;
        if (mask) {
          const mx = tile ? x % mask.w : Math.min(mask.w - 1, (x / w * mask.w) | 0);
          const my = tile ? y % mask.h : Math.min(mask.h - 1, (y / h * mask.h) | 0);
          t = mask.data[my * mask.w + mx];
        } else {
          t = (BAYER8[y & 7][x & 7] + 0.5) / 64;
        }
        if (invert) t = 1 - t;
        gray[y * w + x] = gray[y * w + x] + bias >= t ? 1 : 0;
      }
    }
    return gray;
  },
};
