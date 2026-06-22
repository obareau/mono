import type { FrameContext, Gray, ParamValues, TerminalRender } from "../filters/types";
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
export function runPipeline(
  source: SourceImage,
  stack: StackItem[],
  ctx: FrameContext = { time: 0, frame: 0 },
): PipelineResult {
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
      gray = filter.apply(gray, w, h, item.params, ctx);
    }
  }
  return { gray, w, h };
}
