import type { Filter } from "./types";

// Photographic colour filter for black & white, like screwing a coloured glass onto the
// lens of a B&W camera. A filter passes its own colour (rendering it lighter) and blocks
// the complementary colour (rendering it darker) — e.g. a red filter dramatises blue skies.
// It works by re-deriving the grayscale from the source RGB with per-channel weights.

type W = [number, number, number]; // red, green, blue weights

const PRESETS: Record<string, W> = {
  Neutral: [0.299, 0.587, 0.114], // standard luma
  Red: [0.8, 0.15, 0.05],
  Orange: [0.55, 0.35, 0.1],
  Yellow: [0.4, 0.5, 0.1],
  Green: [0.1, 0.8, 0.1],
  Blue: [0.05, 0.25, 0.7],
};

export const photoFilter: Filter = {
  id: "photo-filter",
  name: "Color Filter",
  category: "color",
  params: [
    { key: "preset", label: "Filter", type: "select", default: "Neutral",
      options: ["Neutral", "Red", "Orange", "Yellow", "Green", "Blue", "Custom"] },
    { key: "red", label: "Red", type: "range", default: 0.3, min: 0, max: 1, step: 0.01 },
    { key: "green", label: "Green", type: "range", default: 0.59, min: 0, max: 1, step: 0.01 },
    { key: "blue", label: "Blue", type: "range", default: 0.11, min: 0, max: 1, step: 0.01 },
  ],
  fromRGB(r, g, b, w, h, p) {
    const preset = p.preset as string;
    let weights: W;
    if (preset === "Custom") weights = [p.red as number, p.green as number, p.blue as number];
    else weights = PRESETS[preset] ?? PRESETS.Neutral;

    // normalise so overall brightness stays stable regardless of filter strength
    const sum = weights[0] + weights[1] + weights[2] || 1;
    const wr = weights[0] / sum;
    const wg = weights[1] / sum;
    const wb = weights[2] / sum;

    const out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i++) {
      const v = wr * r[i] + wg * g[i] + wb * b[i];
      out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    return out;
  },
};
