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
};
