import type { Filter } from "./types";

// Gray-Scott reaction-diffusion. Two virtual chemicals react and diffuse on a grid, growing
// Turing patterns (coral, spots, mazes) seeded from the image's dark areas. It's iterative
// and heavy, so it runs on a downscaled grid (then upscales) — and lives behind the Web
// Worker, so the UI stays responsive. dt and the Laplacian are tuned for stable patterns.

// 9-point Laplacian on a toroidal grid (orthogonal 0.2, diagonal 0.05, center −1).
function lap(a: Float32Array, gw: number, gh: number, x: number, y: number): number {
  const xm = (x - 1 + gw) % gw, xp = (x + 1) % gw, ym = (y - 1 + gh) % gh, yp = (y + 1) % gh;
  return (a[y * gw + xm] + a[y * gw + xp] + a[ym * gw + x] + a[yp * gw + x]) * 0.2 +
    (a[ym * gw + xm] + a[ym * gw + xp] + a[yp * gw + xm] + a[yp * gw + xp]) * 0.05 -
    a[y * gw + x];
}

export const reactionDiffusion: Filter = {
  id: "reaction-diffusion",
  name: "Reaction-Diffusion",
  category: "screen",
  params: [
    { key: "feed", label: "Feed", type: "range", default: 0.037, min: 0.01, max: 0.09, step: 0.001 },
    { key: "kill", label: "Kill", type: "range", default: 0.06, min: 0.04, max: 0.07, step: 0.001 },
    { key: "iter", label: "Iterations", type: "range", default: 1500, min: 200, max: 5000, step: 100 },
    { key: "grid", label: "Grid px", type: "range", default: 180, min: 64, max: 320, step: 8 },
    { key: "seedImg", label: "Seed from image", type: "toggle", default: true },
    { key: "thresh", label: "Threshold", type: "range", default: 0, min: 0, max: 1, step: 0.01 },
  ],
  apply(gray, w, h, p) {
    const F = p.feed as number, k = p.kill as number;
    const iters = Math.round(p.iter as number);
    const cap = Math.round(p.grid as number);
    const seedImg = p.seedImg as boolean;
    const thr = p.thresh as number;

    const scale = Math.min(1, cap / Math.max(w, h));
    const gw = Math.max(8, Math.round(w * scale)), gh = Math.max(8, Math.round(h * scale));
    const n = gw * gh;

    // downsample the source (point sample) to seed V
    const small = new Float32Array(n);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const sx = Math.min(w - 1, (x / gw * w) | 0), sy = Math.min(h - 1, (y / gh * h) | 0);
      small[y * gw + x] = gray[sy * w + sx];
    }

    const rnd = (i: number) => { const s = Math.sin(i * 12.9898 + 7.13) * 43758.5453; return s - Math.floor(s); };
    let U = new Float32Array(n), V = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const seed = seedImg ? 1 - small[i] : (rnd(i) < 0.06 ? 1 : 0); // ink → reactant
      V[i] = Math.min(1, seed) * (0.25 + 0.25 * rnd(i + 1));
      U[i] = 1 - V[i] * 0.5;
    }

    const Du = 0.16, Dv = 0.08, dt = 1.0;
    let U2 = new Float32Array(n), V2 = new Float32Array(n);
    for (let it = 0; it < iters; it++) {
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const i = y * gw + x;
          const u = U[i], v = V[i];
          const uvv = u * v * v;
          U2[i] = u + (Du * lap(U, gw, gh, x, y) - uvv + F * (1 - u)) * dt;
          V2[i] = v + (Dv * lap(V, gw, gh, x, y) + uvv - (F + k) * v) * dt;
        }
      }
      [U, U2] = [U2, U];
      [V, V2] = [V2, V];
    }

    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < n; i++) { if (V[i] < mn) mn = V[i]; if (V[i] > mx) mx = V[i]; }
    const rng = mx - mn || 1;

    // bilinear upscale to full resolution; high V → ink
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = Math.max(0, Math.min(gw - 1, x / w * gw - 0.5));
        const gy = Math.max(0, Math.min(gh - 1, y / h * gh - 0.5));
        const x0 = Math.floor(gx), y0 = Math.floor(gy);
        const x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
        const fx = gx - x0, fy = gy - y0; // now always in [0, 1]
        const v = (V[y0 * gw + x0] * (1 - fx) + V[y0 * gw + x1] * fx) * (1 - fy) +
          (V[y1 * gw + x0] * (1 - fx) + V[y1 * gw + x1] * fx) * fy;
        let nv = (v - mn) / rng;
        if (thr > 0) nv = nv >= thr ? 1 : 0;
        out[y * w + x] = 1 - nv;
      }
    }
    return out;
  },
};
