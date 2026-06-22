import type { Filter } from "./types";

// Contour — topographic iso-luminance lines. Tone is quantized into bands; a black line is
// drawn wherever the band changes (the boundary between levels), like a contour map. Optional
// shading fills each band with its own grey for a fuller topographic look.

export const contour: Filter = {
  id: "contour",
  name: "Contour",
  category: "screen",
  params: [
    { key: "levels", label: "Levels", type: "range", default: 8, min: 2, max: 24, step: 1 },
    { key: "thickness", label: "Thickness", type: "range", default: 1, min: 1, max: 4, step: 1 },
    { key: "shade", label: "Shade bands", type: "range", default: 0, min: 0, max: 1, step: 0.01 },
  ],
  apply(gray, w, h, p) {
    const levels = Math.max(2, Math.round(p.levels as number));
    const th = Math.max(1, Math.round(p.thickness as number));
    const shade = p.shade as number;
    const q = (v: number) => Math.min(levels - 1, Math.floor(Math.min(0.99999, Math.max(0, v)) * levels));
    const out = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ql = q(gray[y * w + x]);
        let edge = false;
        for (let k = 1; k <= th && !edge; k++) {
          if (x + k < w && q(gray[y * w + x + k]) !== ql) edge = true;
          else if (y + k < h && q(gray[(y + k) * w + x]) !== ql) edge = true;
        }
        // base: white, or shaded by the band's level when "shade" > 0
        const band = ql / (levels - 1);
        const base = (1 - shade) + shade * band;
        out[y * w + x] = edge ? 0 : base;
      }
    }
    return out;
  },
};
