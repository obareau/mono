import type { Gray, ParamValues, TerminalRender, VectorScene } from "../filters/types";
import { getFilter } from "../filters/registry";

export interface StackItem {
  uid: number;
  filterId: string;
  params: ParamValues;
  enabled: boolean;
  opacity?: number; // 0..1 blend of this filter's result with its input (default 1)
}

// A stack item without the UI-only uid — what the worker and presets carry.
export type StackEntry = { filterId: string; params: ParamValues; enabled: boolean; opacity?: number };

// The grayscale source planes the pipeline reads. SourceImage is assignable; the worker
// stores a bare copy. Decoupled from io/loadImage so this module stays DOM-free (worker-safe).
export type PipelineSource = { gray: Gray; r: Gray; g: Gray; b: Gray; w: number; h: number };

// Apply a buffer filter, then blend its result toward the input by (1 - opacity).
function applyItem(filter: { apply?: (g: Gray, w: number, h: number, p: ParamValues) => Gray }, gray: Gray, w: number, h: number, item: StackEntry): Gray {
  if (!filter.apply) return gray;
  const op = item.opacity ?? 1;
  if (op >= 1) return filter.apply(gray, w, h, item.params);
  const input = gray.slice(); // keep the pre-filter buffer (filters may mutate in place)
  const out = filter.apply(gray, w, h, item.params);
  for (let i = 0; i < out.length; i++) out[i] = input[i] + (out[i] - input[i]) * op;
  return out;
}

export interface PipelineResult {
  gray: Gray;
  w: number;
  h: number;
  terminal?: TerminalRender;
}

// Result of the buffer-only chain: the gray buffer plus, if a terminal filter ended the
// chain, the marker needed to render it (ASCII render() is DOM-bound → stays on main thread).
export interface BufferResult {
  gray: Gray;
  w: number;
  h: number;
  terminal?: { filterId: string; params: ParamValues };
}

// Apply a single stack item to the running gray buffer. Returns the next buffer, or a
// terminal marker if this item ends the chain (ASCII). Shared by the pure runner and the
// worker's cached runner so the per-item logic lives in one place.
export type ItemResult = { gray: Gray } | { terminal: { filterId: string; params: ParamValues } };
export function applyStackItem(source: PipelineSource, gray: Gray, item: StackEntry): ItemResult {
  if (!item.enabled) return { gray };
  const filter = getFilter(item.filterId);
  if (!filter) return { gray };
  if (filter.fromRGB) return { gray: filter.fromRGB(source.r, source.g, source.b, source.w, source.h, item.params) };
  if (filter.terminal && filter.render) return { terminal: { filterId: item.filterId, params: item.params } };
  return { gray: applyItem(filter, gray, source.w, source.h, item) };
}

// Runs the stack top-to-bottom over a copy of the source buffer — pure, DOM-free, so it
// runs in the Web Worker. A colour filter re-derives grayscale from the source RGB; a
// terminal filter (ASCII) ends the chain and is reported as a marker, not rendered here.
export function runPipelineBuffer(source: PipelineSource, stack: StackEntry[]): BufferResult {
  const { w, h } = source;
  let gray: Gray = new Float32Array(source.gray);
  for (const item of stack) {
    const r = applyStackItem(source, gray, item);
    if ("terminal" in r) return { gray, w, h, terminal: r.terminal };
    gray = r.gray;
  }
  return { gray, w, h };
}

// Synchronous full run (used for native-resolution export on the main thread): runs the
// buffer chain, then renders the terminal filter if one ended it.
export function runPipeline(source: PipelineSource, stack: StackEntry[]): PipelineResult {
  const res = runPipelineBuffer(source, stack);
  if (res.terminal) {
    const f = getFilter(res.terminal.filterId)!;
    return { gray: res.gray, w: res.w, h: res.h, terminal: f.render!(res.gray, res.w, res.h, res.terminal.params) };
  }
  return { gray: res.gray, w: res.w, h: res.h };
}

/** Index of the last enabled filter that can emit vectors, or -1. */
export function lastVectorIndex(stack: StackEntry[]): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    const f = getFilter(stack[i].filterId);
    if (stack[i].enabled && f?.toVector) return i;
  }
  return -1;
}

/** Run the stack up to the last vector-capable filter, then emit its scene. */
export function runToVector(source: PipelineSource, stack: StackEntry[]): VectorScene | null {
  const idx = lastVectorIndex(stack);
  if (idx < 0) return null;
  const { w, h } = source;
  let gray: Gray = new Float32Array(source.gray);
  for (let i = 0; i < idx; i++) {
    const item = stack[i];
    if (!item.enabled) continue;
    const filter = getFilter(item.filterId);
    if (!filter) continue;
    if (filter.fromRGB) gray = filter.fromRGB(source.r, source.g, source.b, w, h, item.params);
    else gray = applyItem(filter, gray, w, h, item);
  }
  const vf = getFilter(stack[idx].filterId)!;
  return vf.toVector!(gray, w, h, stack[idx].params);
}
