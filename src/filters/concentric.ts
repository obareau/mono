import type { Filter, VecPrim } from "./types";

// Concentric — a halftone whose dots sit on rings around a centre instead of a square grid,
// with an optional per-ring twist for a spiral rosette. Dot size tracks local darkness.
// Exports to SVG/PDF as circles.

function sample(gray: Float32Array, w: number, h: number, x: number, y: number): number {
  const xi = Math.min(w - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(h - 1, Math.max(0, Math.round(y)));
  return gray[yi * w + xi];
}

// Centre + radius of the ring dot nearest to (x,y); returns null at the very centre.
function nearestDot(x: number, y: number, cx: number, cy: number, spacing: number, twist: number) {
  const dx = x - cx, dy = y - cy;
  const r = Math.hypot(dx, dy);
  const ring = Math.max(1, Math.round(r / spacing));
  const ringR = ring * spacing;
  const n = Math.max(1, Math.round((2 * Math.PI * ringR) / spacing));
  const step = (2 * Math.PI) / n;
  // pick the slot in the twisted frame so the dot lands near this pixel's angle
  const j = Math.round((Math.atan2(dy, dx) - ring * twist) / step);
  const ang = j * step + ring * twist;
  return { x: cx + ringR * Math.cos(ang), y: cy + ringR * Math.sin(ang) };
}

export const concentric: Filter = {
  id: "concentric",
  name: "Concentric",
  category: "screen",
  params: [
    { key: "spacing", label: "Spacing", type: "range", default: 7, min: 2, max: 28, step: 1 },
    { key: "twist", label: "Twist", type: "range", default: 0.2, min: -1, max: 1, step: 0.01 },
    { key: "sharp", label: "Sharpness", type: "range", default: 0.6, min: 0, max: 1, step: 0.01 },
  ],
  apply(gray, w, h, p) {
    const spacing = p.spacing as number;
    const twist = p.twist as number;
    const sharp = p.sharp as number;
    const cx = w / 2, cy = h / 2;
    const out = new Float32Array(gray.length);
    const edge = (1 - sharp) * spacing * 0.5 + 0.001;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = nearestDot(x, y, cx, cy, spacing, twist);
        const ink = 1 - sample(gray, w, h, d.x, d.y);
        const radius = Math.sqrt(Math.max(0, ink)) * spacing * 0.6;
        const dist = Math.hypot(x - d.x, y - d.y);
        const cov = 1 - Math.min(1, Math.max(0, (dist - radius) / edge + 0.5));
        out[y * w + x] = 1 - cov;
      }
    }
    return out;
  },
  toVector(gray, w, h, p) {
    const spacing = p.spacing as number;
    const twist = p.twist as number;
    const cx = w / 2, cy = h / 2;
    const maxRing = Math.ceil(Math.hypot(w, h) / 2 / spacing);
    const prims: VecPrim[] = [];
    for (let ring = 1; ring <= maxRing; ring++) {
      const ringR = ring * spacing;
      const n = Math.max(1, Math.round((2 * Math.PI * ringR) / spacing));
      const step = (2 * Math.PI) / n;
      for (let j = 0; j < n; j++) {
        const ang = j * step + ring * twist;
        const dx = cx + ringR * Math.cos(ang), dy = cy + ringR * Math.sin(ang);
        if (dx < 0 || dx >= w || dy < 0 || dy >= h) continue;
        const ink = 1 - sample(gray, w, h, dx, dy);
        const r = Math.sqrt(Math.max(0, ink)) * spacing * 0.6;
        if (r > 0.15) prims.push({ t: "circle", cx: dx, cy: dy, r });
      }
    }
    return { w, h, prims };
  },
};
