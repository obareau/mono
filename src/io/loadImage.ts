// Decode an image file into a default grayscale buffer (Rec. 601 luma) plus the separate
// R/G/B planes (0..1), downscaled so the long edge fits `maxDim`. The colour planes let
// photographic colour filters re-derive the grayscale with custom channel weights.

import { maxRenderableEdge } from "./safeCanvas";

export interface SourceImage {
  gray: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  w: number;
  h: number;
  /** Original decoded image, kept so export can re-run the stack at full resolution. */
  bitmap?: ImageBitmap;
  natW: number;
  natH: number;
}

// Hard ceiling on the original we keep for full-resolution export. Camera photos are often
// 4032×3024 (12 MP) or larger (48 MP ⇒ 8000×6000); a canvas that big overflows the per-canvas
// limits mobile browsers enforce (iOS Safari caps total area at ~16.7 M px = 4096², and older
// devices far lower). Over the limit, drawImage/getImageData/toBlob silently yield a BLANK
// canvas — so the exported PNG loses every effect while the ≤1024 preview stays correct. We
// downscale the kept bitmap on load so nothing downstream can exceed a safe raster size.
// "Lychee hotfix" — see CHANGELOG.md.
export const MAX_SOURCE = 4096;
const MAX_SOURCE_AREA = 4096 * 4096; // 16.7 M px — the modern iOS Safari ceiling

// Fit (w,h) under both the long-edge and total-area caps, preserving aspect ratio. The long-edge
// cap defaults to the *probed* device limit (see safeCanvas) so weak GPUs — some Android phones
// cap below 4096 — are respected too, not just the static ceiling.
export function fitWithin(w: number, h: number, maxDim = maxRenderableEdge(MAX_SOURCE), maxArea = MAX_SOURCE_AREA): number {
  const edgeScale = Math.min(1, maxDim / Math.max(w, h));
  const areaScale = Math.min(1, Math.sqrt(maxArea / (w * h)));
  return Math.min(edgeScale, areaScale);
}

export async function loadImageFile(file: File, maxDim = 1024): Promise<SourceImage> {
  const bitmap = await capBitmap(await createImageBitmap(file));
  return fromBitmap(bitmap, maxDim);
}

// If the decoded image exceeds the safe raster size, re-raster it down to fit and hand back a
// smaller ImageBitmap (closing the oversized original). Drawing an arbitrarily large source
// onto a capped-size destination canvas is allowed; it's a canvas *of* that size that isn't.
export async function capBitmap(bitmap: ImageBitmap): Promise<ImageBitmap> {
  const s = fitWithin(bitmap.width, bitmap.height);
  if (s >= 1) return bitmap;
  const w = Math.max(1, Math.round(bitmap.width * s));
  const h = Math.max(1, Math.round(bitmap.height * s));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return createImageBitmap(canvas);
}

export function fromBitmap(bitmap: ImageBitmap | HTMLImageElement, maxDim: number): SourceImage {
  const iw = "width" in bitmap ? bitmap.width : 0;
  const ih = "height" in bitmap ? bitmap.height : 0;
  const scale = Math.min(1, maxDim / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const n = w * h;
  const gray = new Float32Array(n);
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const rr = data[i] / 255;
    const gg = data[i + 1] / 255;
    const bb = data[i + 2] / 255;
    r[j] = rr;
    g[j] = gg;
    b[j] = bb;
    gray[j] = 0.299 * rr + 0.587 * gg + 0.114 * bb; // Rec. 601 luma default
  }
  const out: SourceImage = { gray, r, g, b, w, h, natW: iw, natH: ih };
  if ("close" in bitmap) out.bitmap = bitmap as ImageBitmap;
  return out;
}
