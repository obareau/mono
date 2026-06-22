import type { SourceImage } from "./loadImage";

// Procedural demo shown on first load: a "MONO°" wordmark in a chunky classic-Mac style,
// surrounded by shaded spheres on a gradient. All grayscale and full of smooth tone, so it
// shows off the dithers/screens immediately. Composed on a canvas (for real text), then read
// into the source buffers.

const gray = (v: number) => {
  const k = Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${k},${k},${k})`;
};

function sphere(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
  g.addColorStop(0, gray(0.97));
  g.addColorStop(0.55, gray(0.55));
  g.addColorStop(1, gray(0.1));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // contact shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.98, r * 0.85, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function demoImage(w = 900, h = 600): SourceImage {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // background: soft diagonal gradient
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, gray(0.92));
  bg.addColorStop(1, gray(0.42));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // spheres around the wordmark (top-right one tucked in the corner to clear the "°")
  sphere(ctx, w * 0.17, h * 0.74, h * 0.2);
  sphere(ctx, w * 0.9, h * 0.18, h * 0.12);
  sphere(ctx, w * 0.72, h * 0.8, h * 0.1);

  // "MONO" wordmark — chunky, with a soft top-down highlight and a dark outline (Mac feel)
  const fs = Math.round(h * 0.3);
  ctx.font = `800 ${fs}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const word = "MONO";
  const wWidth = ctx.measureText(word).width;
  const ringR = fs * 0.2;
  const gap = fs * 0.14;
  const totalW = wWidth + gap + ringR * 2;
  const x0 = (w - totalW) / 2;
  const yc = h * 0.46;

  const tg = ctx.createLinearGradient(0, yc - fs / 2, 0, yc + fs / 2);
  tg.addColorStop(0, gray(0.28));
  tg.addColorStop(1, gray(0.04));
  ctx.fillStyle = tg;
  ctx.fillText(word, x0, yc);
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, fs * 0.018);
  ctx.strokeStyle = gray(0.02);
  ctx.strokeText(word, x0, yc);

  // the degree "°" as a stroked ring, top-right of the word
  const ringX = x0 + wWidth + gap + ringR;
  const ringY = yc - fs * 0.3;
  ctx.lineWidth = ringR * 0.42;
  ctx.strokeStyle = gray(0.06);
  ctx.beginPath();
  ctx.arc(ringX, ringY, ringR, 0, Math.PI * 2);
  ctx.stroke();

  // vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // read back into source buffers
  const d = ctx.getImageData(0, 0, w, h).data;
  const n = w * h;
  const g = new Float32Array(n);
  const r = new Float32Array(n);
  const gg = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const v = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    g[j] = r[j] = gg[j] = b[j] = v;
  }
  return { gray: g, r, g: gg, b, w, h, natW: w, natH: h };
}
