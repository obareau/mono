import type { PipelineSource, StackEntry } from "./pipeline";
import { downscale, runCached, type Tier } from "./pipelineCache";
import { setMasks } from "../io/maskStore";

// Off-main-thread pipeline. The source planes are sent once per image; each "run" replies
// with the gray buffer (transferred) plus a terminal marker if an ASCII filter ended the
// chain — the main thread renders that, since terminal/vector output is DOM-bound.
//
// Two optimisations (see pipelineCache.ts): a prefix cache so editing one filter doesn't
// re-run the whole stack, and a downscaled "low" tier used while dragging a slider.

type InMsg =
  | { type: "source"; gray: Float32Array; r: Float32Array; g: Float32Array; b: Float32Array; w: number; h: number }
  | { type: "masks"; masks: { id: string; name: string; w: number; h: number; data: Float32Array }[] }
  | { type: "run"; reqId: number; stack: StackEntry[]; quality?: "low" | "high" };

const LOW_MAX = 512; // long-edge cap for the drag-preview copy

let hi: Tier | null = null;
let lo: Tier | null = null;

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === "source") {
    const src: PipelineSource = { gray: msg.gray, r: msg.r, g: msg.g, b: msg.b, w: msg.w, h: msg.h };
    hi = { src, cache: [] };
    lo = { src: downscale(src, LOW_MAX), cache: [] };
    return;
  }
  if (msg.type === "masks") {
    setMasks(msg.masks);
    if (hi) hi.cache.length = 0; // masks change filter output → invalidate
    if (lo) lo.cache.length = 0;
    return;
  }
  if (msg.type === "run") {
    const tier = msg.quality === "low" ? lo : hi;
    if (!tier) return;
    try {
      const res = runCached(tier, msg.stack);
      const gray = res.gray as Float32Array;
      self.postMessage(
        { type: "result", reqId: msg.reqId, w: res.w, h: res.h, gray, terminal: res.terminal },
        { transfer: [gray.buffer] },
      );
    } catch (err) {
      // a filter threw — report instead of dying, so the main thread can recover the UI
      self.postMessage({ type: "error", reqId: msg.reqId, message: err instanceof Error ? err.message : String(err) });
    }
  }
};
