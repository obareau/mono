import type { Filter } from "./types";

// XDoG — eXtended Difference-of-Gaussians. Subtracts a wider blur from a narrower one to
// find edges, then a soft threshold inks them in: turns a photo into a bold black line
// drawing (manga / ink). Classic Winnemöller formulation.

function gaussian(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { const e = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = e; sum += e; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + r];
      tmp[y * w + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + r];
      out[y * w + x] = s;
    }
  }
  return out;
}

export const xdog: Filter = {
  id: "xdog",
  name: "XDoG Ink",
  category: "screen",
  params: [
    { key: "sigma", label: "Sigma", type: "range", default: 1.2, min: 0.4, max: 6, step: 0.1 },
    { key: "k", label: "Scale k", type: "range", default: 1.6, min: 1.1, max: 3, step: 0.05 },
    { key: "tau", label: "Tau", type: "range", default: 0.985, min: 0.9, max: 1, step: 0.001 },
    { key: "phi", label: "Sharpness", type: "range", default: 18, min: 1, max: 60, step: 1 },
    { key: "eps", label: "Threshold", type: "range", default: 0, min: -0.2, max: 0.2, step: 0.005 },
  ],
  apply(gray, w, h, p) {
    const sigma = p.sigma as number;
    const u = gaussian(gray, w, h, sigma);
    const v = gaussian(gray, w, h, sigma * (p.k as number));
    const tau = p.tau as number, phi = p.phi as number, eps = p.eps as number;
    for (let i = 0; i < gray.length; i++) {
      const d = u[i] - tau * v[i];
      gray[i] = d >= eps ? 1 : Math.min(1, Math.max(0, 1 + Math.tanh(phi * (d - eps))));
    }
    return gray;
  },
};
