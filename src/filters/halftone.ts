import type { Filter } from "./types";

// Halftone screen ("trame"): the image is broken into a rotated grid of cells; each cell
// becomes a dot whose size tracks the local darkness. The angle + cell size are the classic
// print controls. Darker source -> bigger dot -> more ink.

function sample(gray: Float32Array, w: number, h: number, x: number, y: number): number {
  const xi = Math.min(w - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(h - 1, Math.max(0, Math.round(y)));
  return gray[yi * w + xi];
}

function i_(x: number, y: number, w: number): number {
  return y * w + x;
}

export const halftone: Filter = {
  id: "halftone",
  name: "Halftone",
  category: "screen",
  params: [
    { key: "cell", label: "Cell size", type: "range", default: 6, min: 2, max: 24, step: 1 },
    { key: "angle", label: "Angle", type: "range", default: 45, min: 0, max: 90, step: 1 },
    { key: "shape", label: "Shape", type: "select", default: "dot", options: ["dot", "square", "line"] },
    { key: "sharp", label: "Sharpness", type: "range", default: 0.5, min: 0, max: 1, step: 0.01 },
  ],
  apply(gray, w, h, p) {
    const cell = p.cell as number;
    const ang = ((p.angle as number) * Math.PI) / 180;
    const shape = p.shape as string;
    const sharp = p.sharp as number;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const out = new Float32Array(gray.length);
    const cx = w / 2;
    const cy = h / 2;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // rotate into screen space around image center
        const dx = x - cx;
        const dy = y - cy;
        const u = dx * cos - dy * sin;
        const v = dx * sin + dy * cos;
        // nearest cell center in screen space
        const cu = (Math.floor(u / cell) + 0.5) * cell;
        const cv = (Math.floor(v / cell) + 0.5) * cell;
        // map cell center back to image space to read the source value there
        const sx = cu * cos + cv * sin + cx;
        const sy = -cu * sin + cv * cos + cy;
        const val = sample(gray, w, h, sx, sy);
        const ink = 1 - val; // 0..1 amount of black

        const fu = u - cu;
        const fv = v - cv;
        let coverage: number; // 0 = white, 1 = full black
        if (shape === "square") {
          const r = (ink * cell) / 2;
          coverage = Math.abs(fu) <= r && Math.abs(fv) <= r ? 1 : 0;
        } else if (shape === "line") {
          const r = (ink * cell) / 2;
          coverage = Math.abs(fv) <= r ? 1 : 0;
        } else {
          // dot: radius grows with ink. soft edge controlled by sharpness.
          const dist = Math.sqrt(fu * fu + fv * fv);
          const radius = Math.sqrt(ink) * cell * 0.62;
          const edge = (1 - sharp) * cell * 0.5 + 0.001;
          coverage = 1 - Math.min(1, Math.max(0, (dist - radius) / edge + 0.5));
        }
        out[i_(x, y, w)] = 1 - coverage; // back to luminance (1 white, 0 black)
      }
    }
    return out;
  },
  // Vector: one dot per screen cell, placed back in image space (a circle is rotation-free).
  toVector(gray, w, h, p) {
    const cell = p.cell as number;
    const ang = ((p.angle as number) * Math.PI) / 180;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const cx = w / 2;
    const cy = h / 2;
    // screen-space extent covering the four image corners
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [X, Y] of [[0, 0], [w, 0], [0, h], [w, h]] as const) {
      const dx = X - cx, dy = Y - cy;
      const u = dx * cos - dy * sin;
      const v = dx * sin + dy * cos;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const prims: import("./types").VecPrim[] = [];
    for (let j = Math.floor(minV / cell) - 1; j <= Math.ceil(maxV / cell) + 1; j++) {
      for (let i = Math.floor(minU / cell) - 1; i <= Math.ceil(maxU / cell) + 1; i++) {
        const cu = (i + 0.5) * cell;
        const cv = (j + 0.5) * cell;
        const sx = cu * cos + cv * sin + cx;
        const sy = -cu * sin + cv * cos + cy;
        if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
        const ink = 1 - sample(gray, w, h, sx, sy);
        const r = Math.sqrt(Math.max(0, ink)) * cell * 0.62;
        if (r > 0.15) prims.push({ t: "circle", cx: sx, cy: sy, r });
      }
    }
    return { w, h, prims };
  },
};
