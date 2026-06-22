import type { Filter } from "./types";

// Line-based screens: parallel lines, crosshatch, and spirals. Line thickness tracks local
// darkness, so tones build up the way pen hatching or engraving does. Very zine / risograph.

function lineCover(coord: number, spacing: number, ink: number): boolean {
  // fractional position within a line period; black band width grows with ink
  const f = (coord / spacing - Math.floor(coord / spacing));
  return f < ink;
}

export const hatch: Filter = {
  id: "hatch",
  name: "Hatch",
  category: "screen",
  params: [
    { key: "mode", label: "Mode", type: "select", default: "crosshatch", options: ["lines", "crosshatch", "spiral"] },
    { key: "spacing", label: "Spacing", type: "range", default: 6, min: 2, max: 24, step: 1 },
    { key: "angle", label: "Angle", type: "range", default: 45, min: 0, max: 180, step: 1 },
    { key: "weight", label: "Weight", type: "range", default: 1, min: 0.2, max: 2, step: 0.01 },
  ],
  apply(gray, w, h, p) {
    const mode = p.mode as string;
    const spacing = p.spacing as number;
    const ang = ((p.angle as number) * Math.PI) / 180;
    const weight = p.weight as number;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const cos2 = Math.cos(ang + Math.PI / 2);
    const sin2 = Math.sin(ang + Math.PI / 2);
    const cx = w / 2;
    const cy = h / 2;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const ink = Math.min(1, Math.max(0, (1 - gray[i]) * weight));
        const dx = x - cx;
        const dy = y - cy;
        let black: boolean;
        if (mode === "spiral") {
          const r = Math.sqrt(dx * dx + dy * dy);
          const theta = Math.atan2(dy, dx);
          black = lineCover(r - (theta / (2 * Math.PI)) * spacing, spacing, ink);
        } else if (mode === "crosshatch") {
          const u = dx * cos - dy * sin;
          const v = dx * cos2 - dy * sin2;
          // first set always; second set deepens the darker half-tones
          const c1 = lineCover(u, spacing, ink);
          const c2 = lineCover(v, spacing, Math.max(0, ink * 2 - 1));
          black = c1 || c2;
        } else {
          const u = dx * cos - dy * sin;
          black = lineCover(u, spacing, ink);
        }
        gray[i] = black ? 0 : 1;
      }
    }
    return gray;
  },
  // Vector: each hatch line becomes a poly-line of short segments whose stroke width tracks
  // the local ink — so tone is carried by line thickness, the way engraving works.
  toVector(gray, w, h, p) {
    const mode = p.mode as string;
    const spacing = p.spacing as number;
    const ang = ((p.angle as number) * Math.PI) / 180;
    const weight = p.weight as number;
    const cx = w / 2, cy = h / 2;
    const prims: import("./types").VecPrim[] = [];
    const inkAt = (x: number, y: number) => {
      const xi = Math.min(w - 1, Math.max(0, Math.round(x)));
      const yi = Math.min(h - 1, Math.max(0, Math.round(y)));
      return Math.min(1, Math.max(0, (1 - gray[yi * w + xi]) * weight));
    };

    if (mode === "spiral") {
      const maxR = Math.hypot(w, h) / 2;
      const turns = maxR / spacing;
      const dtheta = spacing / Math.max(spacing, maxR) / 2 + 0.02;
      let prev: [number, number] | null = null;
      for (let th = 0; th <= turns * 2 * Math.PI; th += dtheta) {
        const r = (th / (2 * Math.PI)) * spacing;
        const x = cx + r * Math.cos(th), y = cy + r * Math.sin(th);
        if (prev && x >= 0 && x < w && y >= 0 && y < h) {
          const ink = inkAt(x, y);
          if (ink > 0.02) prims.push({ t: "line", x1: prev[0], y1: prev[1], x2: x, y2: y, sw: ink * spacing });
        }
        prev = [x, y];
      }
      return { w, h, prims };
    }

    // straight hatch sets: one for "lines", two crossed for "crosshatch"
    const sets = mode === "crosshatch" ? [0, Math.PI / 2] : [0];
    for (let si = 0; si < sets.length; si++) {
      const a = ang + sets[si];
      const cos = Math.cos(a), sin = Math.sin(a);
      // line k runs along (sin,cos), spaced along (cos,-sin)
      let aMin = Infinity, aMax = -Infinity, tMin = Infinity, tMax = -Infinity;
      for (const [X, Y] of [[0, 0], [w, 0], [0, h], [w, h]] as const) {
        const dx = X - cx, dy = Y - cy;
        const av = dx * cos - dy * sin;
        const tv = dx * sin + dy * cos;
        aMin = Math.min(aMin, av); aMax = Math.max(aMax, av);
        tMin = Math.min(tMin, tv); tMax = Math.max(tMax, tv);
      }
      const step = Math.max(1.5, spacing);
      for (let k = Math.floor(aMin / spacing); k <= Math.ceil(aMax / spacing); k++) {
        const av = k * spacing;
        for (let t = tMin; t < tMax; t += step) {
          const tm = t + step / 2;
          const x = cx + av * cos + tm * sin, y = cy - av * sin + tm * cos;
          if (x < 0 || x >= w || y < 0 || y >= h) continue;
          let ink = inkAt(x, y);
          if (si === 1) ink = Math.max(0, ink * 2 - 1); // second set only in the darks
          if (ink <= 0.02) continue;
          const x1 = cx + av * cos + t * sin, y1 = cy - av * sin + t * cos;
          const x2 = cx + av * cos + (t + step) * sin, y2 = cy - av * sin + (t + step) * cos;
          prims.push({ t: "line", x1, y1, x2, y2, sw: Math.min(spacing, ink * spacing) });
        }
      }
    }
    return { w, h, prims };
  },
};
