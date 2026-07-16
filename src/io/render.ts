import type { PipelineResult } from "../engine/pipeline";
import { hexToRgb, type InkStyle } from "./export";
import { deliverBlob, canvasToPngBlob } from "./deliver";

// Paint a pipeline result onto a canvas. Buffer results become a 1:1 black & white bitmap;
// terminal results (ASCII) draw themselves at the requested output resolution.

export function renderToCanvas(canvas: HTMLCanvasElement, result: PipelineResult, scale = 1): void {
  const ctx = canvas.getContext("2d")!;

  if (result.terminal) {
    const outW = Math.round(result.w * scale);
    const outH = Math.round(result.h * scale);
    canvas.width = outW;
    canvas.height = outH;
    result.terminal.draw(ctx, outW, outH);
    return;
  }

  const { gray, w, h } = result;
  canvas.width = w;
  canvas.height = h;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    const v = Math.round(Math.min(1, Math.max(0, gray[i])) * 255);
    d[j] = d[j + 1] = d[j + 2] = v;
    d[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// Recolour a rendered B&W canvas: map luminance to a paper→ink ramp, optionally making
// paper transparent (ink coverage = 1 − luma). Works on any result since it reads pixels.
export function recolorCanvas(canvas: HTMLCanvasElement, style: InkStyle): void {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const [ir, ig, ib] = hexToRgb(style.ink);
  const [pr, pg, pb] = hexToRgb(style.paper);
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] / 255; // grayscale: r=g=b
    if (style.transparent) {
      d[i] = ir; d[i + 1] = ig; d[i + 2] = ib;
      d[i + 3] = Math.round((1 - v) * 255); // ink coverage
    } else {
      d[i] = Math.round(pr + (ir - pr) * (1 - v));
      d[i + 1] = Math.round(pg + (ig - pg) * (1 - v));
      d[i + 2] = Math.round(pb + (ib - pb) * (1 - v));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function exportText(text: string, name = "mono.txt"): Promise<void> {
  return deliverBlob(new Blob([text], { type: "text/plain" }), name);
}

// Encode the canvas to PNG and hand it off (share sheet on mobile, download on desktop).
// Rejects if the canvas came back blank — the caller surfaces that instead of saving nothing.
export async function exportPNG(canvas: HTMLCanvasElement, name = "mono.png"): Promise<void> {
  const blob = await canvasToPngBlob(canvas);
  await deliverBlob(blob, name);
}
