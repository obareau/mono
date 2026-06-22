import type { Filter } from "./types";

// Warp — smooth geometric distortions by inverse-mapping each output pixel back into the
// source and sampling it: concentric ripple, swirl/twist, pinch/bulge, and a sine wave.

function sample(src: Float32Array, w: number, h: number, x: number, y: number): number {
  if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
  if (y < 0) y = 0; else if (y > h - 1) y = h - 1;
  const x0 = x | 0, y0 = y | 0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  return (
    src[y0 * w + x0] * (1 - fx) * (1 - fy) + src[y0 * w + x1] * fx * (1 - fy) +
    src[y1 * w + x0] * (1 - fx) * fy + src[y1 * w + x1] * fx * fy
  );
}

export const warp: Filter = {
  id: "warp",
  name: "Warp",
  category: "geometry",
  params: [
    { key: "mode", label: "Mode", type: "select", default: "ripple", options: ["ripple", "swirl", "pinch", "wave"] },
    { key: "amount", label: "Amount", type: "range", default: 0.4, min: -1, max: 1, step: 0.01 },
    { key: "freq", label: "Frequency", type: "range", default: 6, min: 1, max: 40, step: 0.5 },
    { key: "phase", label: "Phase", type: "range", default: 0, min: 0, max: 6.28, step: 0.01 },
  ],
  apply(gray, w, h, p) {
    const mode = p.mode as string;
    const amount = p.amount as number;
    const freq = p.freq as number;
    const phase = p.phase as number;
    const cx = w / 2, cy = h / 2;
    const maxR = Math.hypot(cx, cy);
    const src = gray.slice();
    const out = gray; // write in place is fine — we read from the copy
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx, dy = y - cy;
        let sx = x, sy = y;
        if (mode === "wave") {
          sx = x + Math.sin(y / h * Math.PI * 2 * freq + phase) * amount * 40;
          sy = y + Math.sin(x / w * Math.PI * 2 * freq + phase) * amount * 40;
        } else {
          const r = Math.hypot(dx, dy);
          const a = Math.atan2(dy, dx);
          if (mode === "ripple") {
            const rr = r + Math.sin(r / maxR * Math.PI * 2 * freq + phase) * amount * 30;
            sx = cx + Math.cos(a) * rr; sy = cy + Math.sin(a) * rr;
          } else if (mode === "swirl") {
            const aa = a + amount * 3 * (1 - r / maxR);
            sx = cx + Math.cos(aa) * r; sy = cy + Math.sin(aa) * r;
          } else { // pinch / bulge
            const t = Math.pow(r / maxR, 1 - amount * 0.9);
            const rr = t * maxR;
            sx = cx + Math.cos(a) * rr; sy = cy + Math.sin(a) * rr;
          }
        }
        out[y * w + x] = sample(src, w, h, sx, sy);
      }
    }
    return out;
  },
};
