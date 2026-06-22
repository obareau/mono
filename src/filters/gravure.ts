import type { Filter } from "./types";

// Engraving — line hatching that follows the image's flow (isophote direction), the way an
// engraver or banknote portrait curves lines around forms. Built with Line Integral
// Convolution: noise is smeared along the tangent field, then thresholded by tone so shadows
// fill with denser ink.

function hash2(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 53.7) * 43758.5453;
  return s - Math.floor(s);
}

function sampleBilinear(a: Float32Array, w: number, h: number, x: number, y: number): number {
  if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
  if (y < 0) y = 0; else if (y > h - 1) y = h - 1;
  const x0 = x | 0, y0 = y | 0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  return (
    a[y0 * w + x0] * (1 - fx) * (1 - fy) + a[y0 * w + x1] * fx * (1 - fy) +
    a[y1 * w + x0] * (1 - fx) * fy + a[y1 * w + x1] * fx * fy
  );
}

export const gravure: Filter = {
  id: "gravure",
  name: "Engraving",
  category: "screen",
  params: [
    { key: "detail", label: "Smooth", type: "range", default: 2, min: 0, max: 8, step: 1 },
    { key: "length", label: "Length", type: "range", default: 10, min: 2, max: 30, step: 1 },
    { key: "contrast", label: "Contrast", type: "range", default: 2.2, min: 1, max: 6, step: 0.1 },
    { key: "density", label: "Density", type: "range", default: 1, min: 0.3, max: 1.8, step: 0.01 },
    { key: "angle", label: "Base angle", type: "range", default: 45, min: 0, max: 180, step: 1 },
  ],
  apply(gray, w, h, p) {
    const blur = Math.round(p.detail as number);
    const L = Math.round(p.length as number);
    const contrast = p.contrast as number;
    const density = p.density as number;
    const ang = ((p.angle as number) * Math.PI) / 180;
    const baseTx = Math.cos(ang), baseTy = Math.sin(ang);

    // lightly smooth for a stable gradient field
    let g = gray;
    if (blur > 0) {
      const t = new Float32Array(gray.length);
      const r = blur, norm = 1 / (2 * r + 1);
      for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += gray[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[y * w + x] = s * norm; s += gray[y * w + Math.min(w - 1, x + r + 1)] - gray[y * w + Math.max(0, x - r)]; } }
      g = new Float32Array(gray.length);
      for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { g[y * w + x] = s * norm; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
    }

    // tangent field (perpendicular to the Sobel gradient) + white noise
    const tx = new Float32Array(gray.length), ty = new Float32Array(gray.length);
    const noise = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const xm = Math.max(0, x - 1), xp = Math.min(w - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(h - 1, y + 1);
        const gx = (g[ym * w + xp] + 2 * g[y * w + xp] + g[yp * w + xp]) - (g[ym * w + xm] + 2 * g[y * w + xm] + g[yp * w + xm]);
        const gy = (g[yp * w + xm] + 2 * g[yp * w + x] + g[yp * w + xp]) - (g[ym * w + xm] + 2 * g[ym * w + x] + g[ym * w + xp]);
        let vxv = -gy, vyv = gx;
        const mag = Math.hypot(vxv, vyv);
        if (mag < 1e-3) { vxv = baseTx; vyv = baseTy; } else { vxv /= mag; vyv /= mag; }
        tx[y * w + x] = vxv; ty[y * w + x] = vyv;
        noise[y * w + x] = hash2(x, y, 1);
      }
    }

    // LIC: smear noise along the flow, both directions
    const out = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = noise[y * w + x], cnt = 1;
        for (const dir of [1, -1]) {
          let px = x + 0.5, py = y + 0.5;
          let pdx = tx[y * w + x] * dir, pdy = ty[y * w + x] * dir;
          for (let s = 0; s < L; s++) {
            px += pdx; py += pdy;
            if (px < 0 || py < 0 || px >= w || py >= h) break;
            const nvx = sampleBilinear(tx, w, h, px, py), nvy = sampleBilinear(ty, w, h, px, py);
            // keep walking the same way along the streamline
            const d = nvx * pdx + nvy * pdy;
            pdx = d < 0 ? -nvx : nvx; pdy = d < 0 ? -nvy : nvy;
            sum += sampleBilinear(noise, w, h, px, py); cnt++;
          }
        }
        const lic = 0.5 + (sum / cnt - 0.5) * contrast;
        const ink = Math.min(1, Math.max(0, (1 - gray[y * w + x]) * density));
        out[y * w + x] = lic < ink ? 0 : 1; // engrave: black where the streak falls below the tone
      }
    }
    return out;
  },
};
