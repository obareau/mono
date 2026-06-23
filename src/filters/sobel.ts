import type { Filter } from "./types";

// Clean Sobel edge detector: gradient magnitude, optional non-maximum suppression so edges
// come out one pixel thin, then a hard threshold. Unlike XDoG (difference-of-Gaussians ink)
// or Contour Shock, this is a crisp technical line trace.

// Compact separable Gaussian blur (clamped edges).
function gaussian(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0) return src;
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { const e = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = e; sum += e; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + r];
    tmp[y * w + x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + r];
    out[y * w + x] = s;
  }
  return out;
}

export const sobel: Filter = {
  id: "sobel",
  name: "Sobel Edge",
  category: "screen",
  params: [
    { key: "blur", label: "Pre-blur", type: "range", default: 1, min: 0, max: 4, step: 0.1 },
    { key: "thresh", label: "Threshold", type: "range", default: 0.16, min: 0.01, max: 0.8, step: 0.01 },
    { key: "thin", label: "Thin (NMS)", type: "toggle", default: true },
    { key: "invert", label: "White on black", type: "toggle", default: false },
  ],
  apply(gray, w, h, p) {
    const src = gaussian(gray, w, h, p.blur as number);
    const thresh = p.thresh as number;
    const thin = p.thin as boolean;
    const invert = p.invert as boolean;

    const mag = new Float32Array(w * h);
    const dir = new Float32Array(w * h); // gradient angle, radians
    const at = (x: number, y: number) => src[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
    let maxMag = 1e-6;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx =
          -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
          at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
        const gy =
          -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
          at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
        const m = Math.hypot(gx, gy);
        mag[y * w + x] = m;
        dir[y * w + x] = Math.atan2(gy, gx);
        if (m > maxMag) maxMag = m;
      }
    }

    const out = new Float32Array(w * h);
    const bg = invert ? 0 : 1;
    const fg = invert ? 1 : 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const m = mag[i] / maxMag;
        let edge = m >= thresh;
        if (edge && thin) {
          // suppress unless this is a local maximum across the gradient direction
          const a = dir[i];
          const dx = Math.round(Math.cos(a));
          const dy = Math.round(Math.sin(a));
          const m1 = (mag[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))]) / maxMag;
          const m2 = (mag[Math.min(h - 1, Math.max(0, y - dy)) * w + Math.min(w - 1, Math.max(0, x - dx))]) / maxMag;
          if (m < m1 || m < m2) edge = false;
        }
        out[i] = edge ? fg : bg;
      }
    }
    return out;
  },
};
