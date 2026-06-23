import { applyStackItem, type BufferResult, type PipelineSource, type StackEntry } from "./pipeline";
import type { Gray } from "../filters/types";

// Prefix-memoised pipeline runner used by the Web Worker. The gray buffer after each stack
// item is cached, keyed by the cumulative serialization of items 0..i — so editing the last
// filter re-runs only that filter, while editing the first re-runs everything. Pure (no DOM,
// no `self`), so it's unit-testable in Node.

export interface Tier {
  src: PipelineSource;
  cache: { key: string; gray: Float32Array }[];
}

// Nearest-neighbour downscale of the source planes (fast; used for the low-quality tier).
export function downscale(s: PipelineSource, max: number): PipelineSource {
  const scale = Math.min(1, max / Math.max(s.w, s.h));
  if (scale >= 1) return s;
  const w = Math.max(1, Math.round(s.w * scale)), h = Math.max(1, Math.round(s.h * scale));
  const gray = new Float32Array(w * h), r = new Float32Array(w * h), g = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(s.h - 1, (y / h * s.h) | 0);
    for (let x = 0; x < w; x++) {
      const sx = Math.min(s.w - 1, (x / w * s.w) | 0);
      const si = sy * s.w + sx, di = y * w + x;
      gray[di] = s.gray[si]; r[di] = s.r[si]; g[di] = s.g[si]; b[di] = s.b[si];
    }
  }
  return { gray, r, g, b, w, h };
}

// Run the stack over a tier, reusing the longest cached prefix that still matches.
export function runCached(tier: Tier, stack: StackEntry[]): BufferResult {
  const { src, cache } = tier;
  // cumulative keys: keys[i] identifies items 0..i exactly
  const keys: string[] = [];
  let acc = "";
  for (let i = 0; i < stack.length; i++) { acc += "|" + JSON.stringify(stack[i]); keys[i] = acc; }

  let matched = -1;
  for (let i = 0; i < stack.length && i < cache.length; i++) {
    if (cache[i].key === keys[i]) matched = i; else break;
  }
  cache.length = matched + 1; // drop the now-invalid tail

  let gray: Gray = matched >= 0 ? cache[matched].gray.slice() : new Float32Array(src.gray);
  for (let i = matched + 1; i < stack.length; i++) {
    const res = applyStackItem(src, gray, stack[i]);
    if ("terminal" in res) return { gray, w: src.w, h: src.h, terminal: res.terminal };
    gray = res.gray;
    cache[i] = { key: keys[i], gray: gray.slice() }; // keep an independent copy
  }
  return { gray, w: src.w, h: src.h };
}
