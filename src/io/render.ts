import type { PipelineResult } from "../engine/pipeline";

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

export function exportPNG(canvas: HTMLCanvasElement, name = "mono-lab.png"): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
