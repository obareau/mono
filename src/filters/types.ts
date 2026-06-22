// Core filter abstraction.
//
// The whole app is one pipeline:  source image -> grayscale buffer -> [filters] -> output.
// A "grayscale buffer" is a Float32Array of length w*h, each value in [0,1] (0 = black, 1 = white).
// Most filters transform that buffer. Dithering filters collapse it to exactly 0 or 1.
// A "terminal" filter (e.g. ASCII) does not output pixels — it renders its own representation.

// Grayscale pixel buffer, 0..1 per sample. Aliased so the (TS 5.7+) typed-array buffer
// generic stays consistent across the whole pipeline regardless of how a buffer was made.
export type Gray = Float32Array<ArrayBufferLike>;

export type ParamType = "range" | "toggle" | "select" | "text";

export interface ParamDef {
  key: string;
  label: string;
  type: ParamType;
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export type ParamValues = Record<string, number | boolean | string>;

export type FilterCategory = "tone" | "dither" | "screen" | "offset" | "ascii";

// Output of a terminal filter: it draws straight onto the output canvas.
export interface TerminalRender {
  /** Renders into the given 2D context sized to (outW, outH) device pixels. */
  draw(ctx: CanvasRenderingContext2D, outW: number, outH: number): void;
}

export interface Filter {
  id: string;
  name: string;
  category: FilterCategory;
  params: ParamDef[];
  /** True for filters that produce their own rendering instead of a pixel buffer. */
  terminal?: boolean;
  /** Buffer transform. Receives & returns a grayscale buffer (values 0..1). */
  apply?(gray: Gray, w: number, h: number, p: ParamValues): Gray;
  /** Terminal render. Receives the grayscale buffer produced by upstream filters. */
  render?(gray: Gray, w: number, h: number, p: ParamValues): TerminalRender;
}

/** Build a default param-values object from a filter definition. */
export function defaultParams(f: Filter): ParamValues {
  const out: ParamValues = {};
  for (const d of f.params) out[d.key] = d.default;
  return out;
}
