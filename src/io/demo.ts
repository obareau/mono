import type { SourceImage } from "./loadImage";

// A procedural demo image shown on first load, so the live site shows the tool working
// instead of an empty canvas. A shaded sphere on a gradient ground gives a full, smooth
// tonal range — exactly what shows off dithering and screens. No bundled asset needed.
export function demoImage(w = 840, h = 560): SourceImage {
  const n = w * h;
  const gray = new Float32Array(n);
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  const sx = w * 0.5, sy = h * 0.54, R = Math.min(w, h) * 0.34;
  const lx = -0.42, ly = -0.5, lz = 0.756; // light direction
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0.16 + 0.52 * (y / h); // vertical gradient ground
      const dx = (x - sx) / R, dy = (y - sy) / R;
      const d2 = dx * dx + dy * dy;
      if (d2 <= 1) {
        const dz = Math.sqrt(1 - d2);
        const diff = Math.max(0, dx * lx + dy * ly + dz * lz);
        v = 0.07 + 0.9 * Math.pow(diff, 1.1) + 0.35 * Math.pow(diff, 22); // diffuse + specular
      }
      const vig = 1 - 0.3 * Math.hypot((x - w / 2) / w, (y - h / 2) / h);
      v = Math.min(1, Math.max(0, v * vig));
      const i = y * w + x;
      gray[i] = r[i] = g[i] = b[i] = v;
    }
  }
  return { gray, r, g, b, w, h, natW: w, natH: h };
}
