import type { Filter } from "./types";

// Geometric reductions: square mosaic + quantize, luminance-adaptive mosaic, low-poly
// triangulation, and hexagonal tessellation. Each replaces regions with their average tone.

// PIXEL MOSAIC — block-average, then quantize the levels.
const pixelMosaic: Filter = {
  id: "pixel-mosaic",
  name: "Pixel Mosaic",
  category: "geometry",
  params: [
    { key: "cell", label: "Cell px", type: "range", default: 10, min: 2, max: 80, step: 1 },
    { key: "levels", label: "Levels", type: "range", default: 0, min: 0, max: 16, step: 1 },
  ],
  apply(gray, w, h, p) {
    const cell = Math.max(1, Math.round(p.cell as number));
    const levels = Math.round(p.levels as number); // 0 = no quantization
    const out = new Float32Array(gray.length);
    for (let by = 0; by < h; by += cell) {
      for (let bx = 0; bx < w; bx += cell) {
        let sum = 0;
        let n = 0;
        const ey = Math.min(h, by + cell);
        const ex = Math.min(w, bx + cell);
        for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { sum += gray[y * w + x]; n++; }
        let v = n ? sum / n : 0;
        if (levels >= 2) v = Math.round(v * (levels - 1)) / (levels - 1);
        for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) out[y * w + x] = v;
      }
    }
    return out;
  },
};

// ADAPTIVE MOSAIC — each coarse block subdivides into finer cells based on its brightness.
const adaptiveMosaic: Filter = {
  id: "adaptive-mosaic",
  name: "Adaptive Mosaic",
  category: "geometry",
  params: [
    { key: "block", label: "Block px", type: "range", default: 48, min: 8, max: 160, step: 1 },
    { key: "maxsub", label: "Max split", type: "range", default: 6, min: 1, max: 12, step: 1 },
    { key: "invert", label: "Dark = finer", type: "toggle", default: false },
  ],
  apply(gray, w, h, p) {
    const block = Math.max(2, Math.round(p.block as number));
    const maxSub = Math.max(1, Math.round(p.maxsub as number));
    const inv = p.invert as boolean;
    const out = new Float32Array(gray.length);
    for (let by = 0; by < h; by += block) {
      for (let bx = 0; bx < w; bx += block) {
        const ey = Math.min(h, by + block);
        const ex = Math.min(w, bx + block);
        // coarse brightness picks how many sub-cells this block splits into
        let bsum = 0, bn = 0;
        for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { bsum += gray[y * w + x]; bn++; }
        const lum = bn ? bsum / bn : 0;
        const drive = inv ? 1 - lum : lum;
        const sub = Math.max(1, Math.round(1 + drive * (maxSub - 1)));
        const cw = (ex - bx) / sub;
        const ch = (ey - by) / sub;
        for (let sy = 0; sy < sub; sy++) {
          for (let sx = 0; sx < sub; sx++) {
            const cx0 = Math.round(bx + sx * cw), cx1 = Math.round(bx + (sx + 1) * cw);
            const cy0 = Math.round(by + sy * ch), cy1 = Math.round(by + (sy + 1) * ch);
            let s = 0, nn = 0;
            for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) { s += gray[y * w + x]; nn++; }
            const v = nn ? s / nn : lum;
            for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) out[y * w + x] = v;
          }
        }
      }
    }
    return out;
  },
};

// TRIANGULATION — jittered grid, two triangles per cell, each filled with its average tone.
function jitter(gx: number, gy: number, seed: number): number {
  const s = Math.sin(gx * 127.1 + gy * 311.7 + seed * 53.7) * 43758.5453;
  return s - Math.floor(s) - 0.5;
}

const triangulate: Filter = {
  id: "triangulate",
  name: "Triangulation",
  category: "geometry",
  params: [
    { key: "cell", label: "Cell px", type: "range", default: 28, min: 6, max: 120, step: 1 },
    { key: "jitter", label: "Jitter", type: "range", default: 0.4, min: 0, max: 0.8, step: 0.01 },
    { key: "seed", label: "Seed", type: "range", default: 1, min: 1, max: 999, step: 1 },
  ],
  apply(gray, w, h, p) {
    const cell = Math.max(3, Math.round(p.cell as number));
    const jit = (p.jitter as number) * cell;
    const seed = p.seed as number;
    const out = new Float32Array(gray); // copy as fallback for any seam pixel left uncovered
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell) + 1;
    const vx = (gx: number, gy: number) => gx * cell + (gx === 0 || gx >= cols - 1 ? 0 : jitter(gx, gy, seed) * jit);
    const vy = (gx: number, gy: number) => gy * cell + (gy === 0 || gy >= rows - 1 ? 0 : jitter(gx + 99, gy, seed) * jit);

    for (let gy = 0; gy < rows - 1; gy++) {
      for (let gx = 0; gx < cols - 1; gx++) {
        const ax = vx(gx, gy), ay = vy(gx, gy);
        const bx = vx(gx + 1, gy), by = vy(gx + 1, gy);
        const cx = vx(gx, gy + 1), cy = vy(gx, gy + 1);
        const dx = vx(gx + 1, gy + 1), dy = vy(gx + 1, gy + 1);
        fillTri(gray, out, w, h, ax, ay, bx, by, dx, dy);
        fillTri(gray, out, w, h, ax, ay, dx, dy, cx, cy);
      }
    }
    return out;
  },
};

function fillTri(src: Float32Array, out: Float32Array, w: number, h: number,
                 x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(area) < 1e-6) return;
  const inv = 1 / area;
  // first pass: average tone inside the triangle
  let sum = 0, n = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const wa = ((x1 - x) * (y2 - y) - (x2 - x) * (y1 - y)) * inv;
      const wb = ((x2 - x) * (y0 - y) - (x0 - x) * (y2 - y)) * inv;
      const wc = 1 - wa - wb;
      if (wa >= 0 && wb >= 0 && wc >= 0) { sum += src[y * w + x]; n++; }
    }
  }
  const v = n ? sum / n : 0;
  // second pass: fill
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const wa = ((x1 - x) * (y2 - y) - (x2 - x) * (y1 - y)) * inv;
      const wb = ((x2 - x) * (y0 - y) - (x0 - x) * (y2 - y)) * inv;
      const wc = 1 - wa - wb;
      if (wa >= 0 && wb >= 0 && wc >= 0) out[y * w + x] = v;
    }
  }
}

// TESSELLATION — hexagonal tiling; every hex cell is flat-filled with its mean tone.
const tessellate: Filter = {
  id: "tessellate",
  name: "Tessellation",
  category: "geometry",
  params: [
    { key: "size", label: "Hex px", type: "range", default: 16, min: 4, max: 80, step: 1 },
  ],
  apply(gray, w, h, p) {
    const s = Math.max(2, p.size as number);
    const sums = new Map<number, number>();
    const counts = new Map<number, number>();
    const idOf = (x: number, y: number): number => {
      // pixel -> axial hex coords -> cube-rounded cell id
      const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / s;
      const r = ((2 / 3) * y) / s;
      let cx = q, cz = r, cy = -cx - cz;
      let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
      const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
      if (dx > dy && dx > dz) rx = -ry - rz;
      else if (dy > dz) ry = -rx - rz;
      else rz = -rx - ry;
      return (rx + 4096) * 8192 + (rz + 4096); // pack to a single key
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const id = idOf(x, y);
        sums.set(id, (sums.get(id) ?? 0) + gray[y * w + x]);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    const out = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const id = idOf(x, y);
        out[y * w + x] = (sums.get(id) ?? 0) / (counts.get(id) ?? 1);
      }
    }
    return out;
  },
};

// VORONOI — jittered seed points; each pixel joins its nearest seed's cell, flat-filled
// with that cell's mean tone. Irregular, crystalline mosaic (vs the regular hex tiling).
const voronoi: Filter = {
  id: "voronoi",
  name: "Voronoi",
  category: "geometry",
  params: [
    { key: "spacing", label: "Spacing", type: "range", default: 18, min: 4, max: 80, step: 1 },
    { key: "jitter", label: "Jitter", type: "range", default: 0.8, min: 0, max: 1, step: 0.01 },
    { key: "seed", label: "Seed", type: "range", default: 1, min: 1, max: 999, step: 1 },
  ],
  apply(gray, w, h, p) {
    const s = Math.max(2, Math.round(p.spacing as number));
    const jit = (p.jitter as number) * s;
    const seed = p.seed as number;
    const cols = Math.ceil(w / s) + 2;
    const rows = Math.ceil(h / s) + 2;
    const sxOf = (gx: number, gy: number) => (gx + 0.5) * s + jitter(gx, gy, seed) * jit;
    const syOf = (gx: number, gy: number) => (gy + 0.5) * s + jitter(gx + 37, gy + 11, seed) * jit;
    const nearest = (x: number, y: number): number => {
      const gx0 = Math.floor(x / s), gy0 = Math.floor(y / s);
      let best = 0, bd = Infinity;
      for (let gy = gy0 - 1; gy <= gy0 + 1; gy++) {
        for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) {
          if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
          const dx = x - sxOf(gx, gy), dy = y - syOf(gx, gy);
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = gy * cols + gx; }
        }
      }
      return best;
    };
    const sums = new Float64Array(cols * rows);
    const counts = new Uint32Array(cols * rows);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const id = nearest(x, y); sums[id] += gray[y * w + x]; counts[id]++; }
    const out = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const id = nearest(x, y); out[y * w + x] = counts[id] ? sums[id] / counts[id] : gray[y * w + x]; }
    return out;
  },
};

export const GEOMETRY: Filter[] = [pixelMosaic, adaptiveMosaic, triangulate, tessellate, voronoi];
