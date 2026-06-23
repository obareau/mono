// Holds user-loaded threshold maps (dither masks) in memory, keyed by id. Masks are local
// to the session — presets/URLs carry only the id, and the Threshold Map filter falls back
// to a built-in Bayer matrix when the referenced mask isn't loaded.

export interface MaskData {
  w: number;
  h: number;
  data: Float32Array; // luminance 0..1
  name: string;
}

let counter = 1;
let version = 0; // bumps whenever the set changes, so the worker can resync lazily
const masks = new Map<string, MaskData>();

export function getMask(id: string): MaskData | undefined {
  return masks.get(id);
}

export function addMask(name: string, data: Float32Array, w: number, h: number): string {
  const id = "m" + counter++;
  masks.set(id, { name, data, w, h });
  version++;
  return id;
}

export function getMasksVersion(): number {
  return version;
}

/** Snapshot all masks (with their ids) for shipping to the worker. */
export function allMasks(): { id: string; name: string; w: number; h: number; data: Float32Array }[] {
  return [...masks.entries()].map(([id, m]) => ({ id, name: m.name, w: m.w, h: m.h, data: m.data }));
}

/** Worker side: replace the mask set with one received from the main thread. */
export function setMasks(list: { id: string; name: string; w: number; h: number; data: Float32Array }[]): void {
  masks.clear();
  for (const m of list) masks.set(m.id, { name: m.name, w: m.w, h: m.h, data: m.data });
  version++;
}

export async function loadMaskFile(file: File, maxDim = 512): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const data = new Float32Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    data[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
  }
  return addMask(file.name, data, w, h);
}
