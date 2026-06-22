import type { Filter } from "./types";

// Error-diffusion dithering. Each pixel's quantization error is pushed onto not-yet-
// processed neighbours, so this is inherently sequential (cannot run as a GPU shader).
// Includes the classic Floyd-Steinberg kernel plus Atkinson (the MacPaint / classic Mac one).

type Kernel = { dx: number; dy: number; w: number }[];

// Build a kernel from compact [dx, dy, weight] tuples with a shared divisor.
function k(divisor: number, cells: [number, number, number][]): Kernel {
  return cells.map(([dx, dy, n]) => ({ dx, dy, w: n / divisor }));
}

// prettier-ignore
const KERNELS: Record<string, Kernel> = {
  "Floyd-Steinberg": k(16, [[1,0,7],[-1,1,3],[0,1,5],[1,1,1]]),
  // Atkinson diffuses only 6/8 of the error -> the crisp, high-contrast 1984 Mac look.
  "Atkinson": k(8, [[1,0,1],[2,0,1],[-1,1,1],[0,1,1],[1,1,1],[0,2,1]]),
  "Jarvis-Judice-Ninke": k(48, [
    [1,0,7],[2,0,5],
    [-2,1,3],[-1,1,5],[0,1,7],[1,1,5],[2,1,3],
    [-2,2,1],[-1,2,3],[0,2,5],[1,2,3],[2,2,1]]),
  "Stucki": k(42, [
    [1,0,8],[2,0,4],
    [-2,1,2],[-1,1,4],[0,1,8],[1,1,4],[2,1,2],
    [-2,2,1],[-1,2,2],[0,2,4],[1,2,2],[2,2,1]]),
  "Burkes": k(32, [
    [1,0,8],[2,0,4],
    [-2,1,2],[-1,1,4],[0,1,8],[1,1,4],[2,1,2]]),
  "Sierra": k(32, [
    [1,0,5],[2,0,3],
    [-2,1,2],[-1,1,4],[0,1,5],[1,1,4],[2,1,2],
    [-1,2,2],[0,2,3],[1,2,2]]),
  "Sierra Lite": k(4, [[1,0,2],[-1,1,1],[0,1,1]]),
  // Stevenson-Arce: large hexagonal kernel (divisor 200) — smooth, low-texture rendering.
  "Stevenson-Arce": k(200, [
    [2,0,32],
    [-3,1,12],[-1,1,26],[1,1,30],[3,1,16],
    [-2,2,12],[0,2,26],[2,2,12],
    [-3,3,5],[-1,3,12],[1,3,12],[3,3,5]]),
};

const KERNEL_NAMES = Object.keys(KERNELS);
const FLOYD = KERNELS["Floyd-Steinberg"];

export const errorDiffusion: Filter = {
  id: "error-diffusion",
  name: "Error Diffusion",
  category: "dither",
  params: [
    { key: "kernel", label: "Kernel", type: "select", default: "Floyd-Steinberg", options: KERNEL_NAMES },
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
