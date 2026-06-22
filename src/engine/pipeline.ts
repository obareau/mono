import type { Gray, ParamValues, TerminalRender } from "../filters/types";
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
// A terminal filter (ASCII) ends the buffer chain and provides its own renderer.
export function runPipeline(source: Gray, w: number, h: number, stack: StackItem[]): PipelineResult {
  let gray: Gray = new Float32Array(source);
  for (const item of stack) {
    if (!item.enabled) continue;
    const filter = getFilter(item.filterId);
    if (!filter) continue;
    if (filter.terminal && filter.render) {
      return { gray, w, h, terminal: filter.render(gray, w, h, item.params) };
    }
    if (filter.apply) {
      gray = filter.apply(gray, w, h, item.params);
    }
  }
  return { gray, w, h };
}
