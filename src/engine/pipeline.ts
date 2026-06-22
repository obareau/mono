import type { Gray, ParamValues, TerminalRender, VectorScene } from "../filters/types";
import type { SourceImage } from "../io/loadImage";
import { getFilter } from "../filters/registry";

export interface StackItem {
  uid: number;
  filterId: string;
  params: ParamValues;
  enabled: boolean;
}

export interface PipelineResult {
  gray: Gray;
  w: number;
  h: number;
  terminal?: TerminalRender;
}

// Runs the stack top-to-bottom over a copy of the source buffer.
// A colour filter re-derives the grayscale from the source RGB; a terminal filter (ASCII)
// ends the buffer chain and provides its own renderer.
export function runPipeline(source: SourceImage, stack: StackItem[]): PipelineResult {
  const { w, h } = source;
  let gray: Gray = new Float32Array(source.gray);
  for (const item of stack) {
    if (!item.enabled) continue;
    const filter = getFilter(item.filterId);
    if (!filter) continue;
    if (filter.fromRGB) {
      gray = filter.fromRGB(source.r, source.g, source.b, w, h, item.params);
      continue;
    }
    if (filter.terminal && filter.render) {
      return { gray, w, h, terminal: filter.render(gray, w, h, item.params) };
    }
    if (filter.apply) {
      gray = filter.apply(gray, w, h, item.params);
    }
  }
  return { gray, w, h };
}

/** Index of the last enabled filter that can emit vectors, or -1. */
export function lastVectorIndex(stack: StackItem[]): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    const f = getFilter(stack[i].filterId);
    if (stack[i].enabled && f?.toVector) return i;
  }
  return -1;
}

/** Run the stack up to the last vector-capable filter, then emit its scene. */
export function runToVector(source: SourceImage, stack: StackItem[]): VectorScene | null {
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
    else if (filter.apply) gray = filter.apply(gray, w, h, item.params);
  }
  const vf = getFilter(stack[idx].filterId)!;
  return vf.toVector!(gray, w, h, stack[idx].params);
}
