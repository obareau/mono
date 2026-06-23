import type { SourceImage } from "./loadImage";
import { fromBitmap } from "./loadImage";
import demoUrl from "./demo.jpg";

// Load the bundled MONO° splash as the first-load demo (real image → full-res export works).
// Falls back to the procedural scene below if it can't be fetched.
export async function loadDemoImage(): Promise<SourceImage> {
  const blob = await (await fetch(demoUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  return fromBitmap(bitmap, 1024);
}

// First-load intro art in an Amiga / Deluxe Paint spirit: a gradient sky over a perspective
// grid floor, checkered shaded spheres (Boing-Ball style), and the MONO° wordmark. All
// grayscale and tonally rich so it dithers beautifully. Composed on a canvas, read back into
// the source buffers.

const gray = (v: number) => {
  const k = Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${k},${k},${k})`;
};

// A checkered, shaded sphere on a transparent square — drawn per-pixel, returned as a canvas.
function checkerBall(r: number, rot: number, tilt: number): HTMLCanvasElement {
  const D = r * 2;
  const c = document.createElement("canvas");
  c.width = D;
  c.height = D;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(D, D);
  const d = img.data;
  const Lx = -0.4, Ly = -0.5, Lz = 0.768;
  const tilesU = 10, tilesV = 8;
  for (let py = 0; py < D; py++) {
    for (let px = 0; px < D; px++) {
      const dx = (px - r) / r, dy = (py - r) / r, d2 = dx * dx + dy * dy;
      const o = (py * D + px) * 4;
      if (d2 > 1) { d[o + 3] = 0; continue; }
      const dz = Math.sqrt(1 - d2);
      const ny = dy * Math.cos(tilt) - dz * Math.sin(tilt);
      const nz = dy * Math.sin(tilt) + dz * Math.cos(tilt);
      const lon = Math.atan2(dx, nz) + rot;
      const lat = Math.asin(Math.max(-1, Math.min(1, ny)));
      const parity = (Math.floor((lon / Math.PI + 2) * tilesU) + Math.floor((lat / (Math.PI / 2) + 1) * tilesV)) & 1;
      const base = parity ? 0.92 : 0.22;
      const diff = Math.max(0, dx * Lx + dy * Ly + dz * Lz);
      const v = Math.min(1, base * (0.32 + 0.8 * diff) + 0.45 * Math.pow(diff, 28));
      const k = Math.round(v * 255);
      d[o] = d[o + 1] = d[o + 2] = k;
      d[o + 3] = d2 > 0.985 ? Math.round((1 - (d2 - 0.985) / 0.015) * 255) : 255; // soft edge
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function demoImage(w = 900, h = 600): SourceImage {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const horizon = h * 0.58;

  // sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, gray(0.9));
  sky.addColorStop(1, gray(0.6));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  // floor gradient
  const floor = ctx.createLinearGradient(0, horizon, 0, h);
  floor.addColorStop(0, gray(0.48));
  floor.addColorStop(1, gray(0.8));
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, w, h - horizon);

  // perspective grid floor
  ctx.strokeStyle = gray(0.28);
  ctx.lineWidth = 1.5;
  const vx = w / 2;
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const xb = (i / 16) * (w * 2) - w * 0.5; // spread beyond edges
    ctx.moveTo(vx, horizon);
    ctx.lineTo(xb, h);
  }
  for (let i = 1; i <= 12; i++) {
    const y = horizon + (h - horizon) * Math.pow(i / 12, 1.9);
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // checkered Boing-style spheres (third tucked top-left, clear of the wordmark)
  const balls: [number, number, number, number, number][] = [
    [w * 0.24, h * 0.7, 120, 0.6, 0.32],
    [w * 0.76, h * 0.72, 92, 2.1, 0.5],
    [w * 0.12, h * 0.2, 50, 1.2, 0.2],
  ];
  for (const [cx, cy, r, rot, tilt] of balls) {
    // contact shadow
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.96, r * 0.9, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(checkerBall(r, rot, tilt), cx - r, cy - r);
  }

  // MONO° wordmark — hand-drawn marker font, dark ink on the bright sky, "°" as a ring
  const fs = Math.round(h * 0.3);
  ctx.font = `${fs}px "Permanent Marker", "Comic Sans MS", cursive`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const word = "MONO";
  const wWidth = ctx.measureText(word).width;
  const ringR = fs * 0.16, gap = fs * 0.1;
  const x0 = (w - (wWidth + gap + ringR * 2)) / 2;
  const yc = h * 0.32;
  const tg = ctx.createLinearGradient(0, yc - fs / 2, 0, yc + fs / 2);
  tg.addColorStop(0, gray(0.12));
  tg.addColorStop(1, gray(0.42));
  ctx.fillStyle = tg;
  ctx.fillText(word, x0, yc);
  const ringX = x0 + wWidth + gap + ringR, ringY = yc - fs * 0.28;
  ctx.lineWidth = ringR * 0.5;
  ctx.strokeStyle = gray(0.12);
  ctx.beginPath();
  ctx.arc(ringX, ringY, ringR, 0, Math.PI * 2);
  ctx.stroke();

  // read back
  const dd = ctx.getImageData(0, 0, w, h).data;
  const n = w * h;
  const g = new Float32Array(n), r = new Float32Array(n), gg = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0, j = 0; i < dd.length; i += 4, j++) {
    const v = (0.299 * dd[i] + 0.587 * dd[i + 1] + 0.114 * dd[i + 2]) / 255;
    g[j] = r[j] = gg[j] = b[j] = v;
  }
  return { gray: g, r, g: gg, b, w, h, natW: w, natH: h };
}
