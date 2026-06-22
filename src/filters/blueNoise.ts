import type { Filter } from "./types";

// Blue-noise ordered dithering (FM screening). Uses a void-and-cluster threshold tile:
// the minority pixels are spread as evenly as possible (no low-frequency clumps), so the
// dither reads as fine, organic grain rather than a regular pattern. The tile is generated
// once (it's a bit of work) and cached.

const S = 64; // tile size
const N = S * S;
const SIGMA = 1.9;

let TILE: Float32Array | null = null; // normalized thresholds 0..1, cached

// Precomputed Gaussian stamp offsets within radius R (toroidal wrap done at stamp time).
const R = Math.ceil(3 * SIGMA);
const STAMP: { dx: number; dy: number; g: number }[] = [];
for (let dy = -R; dy <= R; dy++) {
  for (let dx = -R; dx <= R; dx++) {
    const g = Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA));
    if (g > 1e-4) STAMP.push({ dx, dy, g });
  }
}

function stamp(energy: Float32Array, x: number, y: number, sign: number) {
  for (const s of STAMP) {
    const nx = (x + s.dx + S) & (S - 1);
    const ny = (y + s.dy + S) & (S - 1);
    energy[ny * S + nx] += sign * s.g;
  }
}

// among cells where binary==target, return index of max (cluster) or min (void) energy
function extreme(energy: Float32Array, binary: Uint8Array, target: number, wantMax: boolean): number {
  let best = -1;
  let bestVal = wantMax ? -Infinity : Infinity;
  for (let i = 0; i < N; i++) {
    if (binary[i] !== target) continue;
    const v = energy[i];
    if (wantMax ? v > bestVal : v < bestVal) {
      bestVal = v;
      best = i;
    }
  }
  return best;
}

function generate(): Float32Array {
  const binary = new Uint8Array(N);
  const energy = new Float32Array(N);

  // seed ~1/10 minority pixels at random (deterministic RNG)
  let seed = 0x9e3779b9;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const initial = Math.floor(N / 10);
  let placed = 0;
  while (placed < initial) {
    const i = (rnd() * N) | 0;
    if (!binary[i]) {
      binary[i] = 1;
      stamp(energy, i % S, (i / S) | 0, 1);
      placed++;
    }
  }

  // phase 1: relax to an even "prototype" pattern
  for (let iter = 0; iter < N; iter++) {
    const cluster = extreme(energy, binary, 1, true); // tightest cluster (a 1)
    binary[cluster] = 0;
    stamp(energy, cluster % S, (cluster / S) | 0, -1);
    const voidIdx = extreme(energy, binary, 0, false); // largest void (a 0)
    binary[voidIdx] = 1;
    stamp(energy, voidIdx % S, (voidIdx / S) | 0, 1);
    if (cluster === voidIdx) break; // stable
  }

  const rank = new Int32Array(N).fill(-1);
  const proto = binary.slice();
  const ones = proto.reduce((a, b) => a + b, 0);

  // phase 2a: rank the prototype ones from tightest cluster downward
  binary.set(proto);
  energy.fill(0);
  for (let i = 0; i < N; i++) if (binary[i]) stamp(energy, i % S, (i / S) | 0, 1);
  for (let r = ones - 1; r >= 0; r--) {
    const c = extreme(energy, binary, 1, true);
    binary[c] = 0;
    stamp(energy, c % S, (c / S) | 0, -1);
    rank[c] = r;
  }

  // phase 2b: fill remaining ranks into the largest voids
  binary.set(proto);
  energy.fill(0);
  for (let i = 0; i < N; i++) if (binary[i]) stamp(energy, i % S, (i / S) | 0, 1);
  for (let r = ones; r < N; r++) {
    const v = extreme(energy, binary, 0, false);
    binary[v] = 1;
    stamp(energy, v % S, (v / S) | 0, 1);
    rank[v] = r;
  }

  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = (rank[i] + 0.5) / N;
  return out;
}

export const blueNoise: Filter = {
  id: "blue-noise",
  name: "Blue Noise",
  category: "dither",
  params: [
    { key: "level", label: "Level", type: "range", default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: "contrast", label: "Contrast", type: "range", default: 1, min: 0.3, max: 2, step: 0.01 },
  ],
  apply(gray, w, h, p) {
    if (!TILE) TILE = generate();
    const tile = TILE;
    const level = p.level as number;
    const k = p.contrast as number;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const t = tile[(y & (S - 1)) * S + (x & (S - 1))];
        // recentre threshold around the chosen level with a contrast gain
        const thr = 0.5 + (t - level) / k;
        gray[i] = gray[i] >= thr ? 1 : 0;
      }
    }
    return gray;
  },
};
