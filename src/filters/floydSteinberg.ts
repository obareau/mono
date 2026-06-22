import type { Filter } from "./types";

// Error-diffusion dithering. Each pixel's quantization error is pushed onto not-yet-
// processed neighbours, so this is inherently sequential (cannot run as a GPU shader).
// Includes the classic Floyd-Steinberg kernel plus Atkinson (the MacPaint / classic Mac one).

type Kernel = { dx: number; dy: number; w: number }[];

const FLOYD: Kernel = [
  { dx: 1, dy: 0, w: 7 / 16 },
  { dx: -1, dy: 1, w: 3 / 16 },
  { dx: 0, dy: 1, w: 5 / 16 },
  { dx: 1, dy: 1, w: 1 / 16 },
];

// Atkinson diffuses only 6/8 of the error -> the crisp, high-contrast look of 1984 Mac.
const ATKINSON: Kernel = [
  { dx: 1, dy: 0, w: 1 / 8 },
  { dx: 2, dy: 0, w: 1 / 8 },
  { dx: -1, dy: 1, w: 1 / 8 },
  { dx: 0, dy: 1, w: 1 / 8 },
  { dx: 1, dy: 1, w: 1 / 8 },
  { dx: 0, dy: 2, w: 1 / 8 },
];

const KERNELS: Record<string, Kernel> = { "Floyd-Steinberg": FLOYD, Atkinson: ATKINSON };

export const errorDiffusion: Filter = {
  id: "error-diffusion",
  name: "Error Diffusion",
  category: "dither",
  params: [
    { key: "kernel", label: "Kernel", type: "select", default: "Floyd-Steinberg", options: ["Floyd-Steinberg", "Atkinson"] },
    { key: "level", label: "Level", type: "range", default: 0.5, min: 0.05, max: 0.95, step: 0.01 },
    { key: "serpentine", label: "Serpentine", type: "toggle", default: true },
  ],
  apply(gray, w, h, p) {
    const kernel = KERNELS[p.kernel as string] ?? FLOYD;
    const level = p.level as number;
    const serpentine = p.serpentine as boolean;
    for (let y = 0; y < h; y++) {
      const ltr = !serpentine || y % 2 === 0;
      const xStart = ltr ? 0 : w - 1;
      const xEnd = ltr ? w : -1;
      const step = ltr ? 1 : -1;
      for (let x = xStart; x !== xEnd; x += step) {
        const i = y * w + x;
        const old = gray[i];
        const neu = old >= level ? 1 : 0;
        gray[i] = neu;
        const err = old - neu;
        for (const k of kernel) {
          const kx = ltr ? k.dx : -k.dx; // mirror kernel on right-to-left rows
          const nx = x + kx;
          const ny = y + k.dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          gray[ny * w + nx] += err * k.w;
        }
      }
    }
    return gray;
  },
};
