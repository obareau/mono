// Decode an image file into a default grayscale buffer (Rec. 601 luma) plus the separate
// R/G/B planes (0..1), downscaled so the long edge fits `maxDim`. The colour planes let
// photographic colour filters re-derive the grayscale with custom channel weights.

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

export async function loadImageFile(file: File, maxDim = 1024): Promise<SourceImage> {
  const bitmap = await createImageBitmap(file);
  return fromBitmap(bitmap, maxDim);
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
