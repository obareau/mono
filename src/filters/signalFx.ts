import type { Filter } from "./types";

// Audio-style effects that treat the image as a 2D signal. Echo, distortion, comb-filter
// flanger/chorus, and low/high-pass. The modulated ones (flanger, chorus) sweep with the
// animation clock, so they come alive in Play / GIF export.

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// linear sample along x (sub-pixel), clamped at row edges
function sampleX(g: Float32Array, w: number, row: number, fx: number): number {
  if (fx < 0) fx = 0;
  if (fx > w - 1) fx = w - 1;
  const x0 = Math.floor(fx);
  const x1 = Math.min(w - 1, x0 + 1);
  const f = fx - x0;
  return g[row + x0] * (1 - f) + g[row + x1] * f;
}

// separable box blur (used by low/high-pass). radius in px.
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const norm = 1 / (2 * r + 1);
  // horizontal
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum * norm;
      const add = src[row + Math.min(w - 1, x + r + 1)];
      const sub = src[row + Math.max(0, x - r)];
      sum += add - sub;
    }
  }
  // vertical
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum * norm;
      const add = tmp[Math.min(h - 1, y + r + 1) * w + x];
      const sub = tmp[Math.max(0, y - r) * w + x];
      sum += add - sub;
    }
  }
  return out;
}

// ECHO — feedback delay line (x[n] += fb * x[n-D]) along an axis: repeating ghosts.
const echo: Filter = {
  id: "echo",
  name: "Echo",
  category: "signal",
  params: [
    { key: "delay", label: "Delay px", type: "range", default: 18, min: 1, max: 120, step: 1 },
    { key: "feedback", label: "Feedback", type: "range", default: 0.55, min: 0, max: 0.95, step: 0.01 },
    { key: "axis", label: "Axis", type: "select", default: "x", options: ["x", "y"] },
  ],
  apply(gray, w, h, p) {
    const d = Math.max(1, Math.round(p.delay as number));
    const fb = p.feedback as number;
    if ((p.axis as string) === "y") {
      for (let x = 0; x < w; x++)
        for (let y = d; y < h; y++) gray[y * w + x] = clamp01(gray[y * w + x] + fb * gray[(y - d) * w + x]);
    } else {
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = d; x < w; x++) gray[row + x] = clamp01(gray[row + x] + fb * gray[row + x - d]);
      }
    }
    return gray;
  },
};

// DISTORTION — waveshaping the luminance signal (soft / hard / fold) with drive + mix.
const distortion: Filter = {
  id: "distortion",
  name: "Distortion",
  category: "signal",
  params: [
    { key: "type", label: "Type", type: "select", default: "soft", options: ["soft", "hard", "fold"] },
    { key: "drive", label: "Drive", type: "range", default: 3, min: 1, max: 20, step: 0.1 },
    { key: "mix", label: "Mix", type: "range", default: 1, min: 0, max: 1, step: 0.01 },
  ],
  apply(gray, _w, _h, p) {
    const type = p.type as string;
    const drive = p.drive as number;
    const mix = p.mix as number;
    const norm = type === "soft" ? Math.tanh(drive * 0.5) : 1;
    for (let i = 0; i < gray.length; i++) {
      const s = (gray[i] - 0.5) * 2; // -1..1
      let o: number;
      if (type === "hard") o = Math.max(-1, Math.min(1, s * drive));
      else if (type === "fold") {
        let v = s * drive;
        // triangle wavefolder
        v = Math.abs(((((v + 1) % 4) + 4) % 4) - 2) - 1;
        o = v;
      } else o = Math.tanh(s * drive) / norm;
      const wet = o * 0.5 + 0.5;
      gray[i] = clamp01(gray[i] * (1 - mix) + wet * mix);
    }
    return gray;
  },
};

// LOW-PASS — blur away high spatial frequencies.
const lowpass: Filter = {
  id: "lowpass",
  name: "Low-Pass",
  category: "signal",
  params: [
    { key: "radius", label: "Radius", type: "range", default: 3, min: 1, max: 40, step: 1 },
    { key: "mix", label: "Mix", type: "range", default: 1, min: 0, max: 1, step: 0.01 },
  ],
  apply(gray, w, h, p) {
    const lp = boxBlur(gray, w, h, Math.round(p.radius as number));
    const mix = p.mix as number;
    for (let i = 0; i < gray.length; i++) gray[i] = gray[i] * (1 - mix) + lp[i] * mix;
    return gray;
  },
};

// HIGH-PASS — keep only the detail (signal minus its low-pass), recentred to mid-grey.
const highpass: Filter = {
  id: "highpass",
  name: "High-Pass",
  category: "signal",
  params: [
    { key: "radius", label: "Radius", type: "range", default: 3, min: 1, max: 40, step: 1 },
    { key: "amount", label: "Amount", type: "range", default: 1, min: 0, max: 3, step: 0.01 },
  ],
  apply(gray, w, h, p) {
    const lp = boxBlur(gray, w, h, Math.round(p.radius as number));
    const amt = p.amount as number;
    for (let i = 0; i < gray.length; i++) gray[i] = clamp01(0.5 + (gray[i] - lp[i]) * amt);
    return gray;
  },
};

// FLANGER — a delay modulated across the image gives a sweeping comb pattern.
const flanger: Filter = {
  id: "flanger",
  name: "Flanger",
  category: "signal",
  params: [
    { key: "delay", label: "Delay px", type: "range", default: 8, min: 1, max: 60, step: 1 },
    { key: "depth", label: "Depth", type: "range", default: 6, min: 0, max: 40, step: 1 },
    { key: "freq", label: "Freq", type: "range", default: 3, min: 0.2, max: 12, step: 0.1 },
    { key: "phase", label: "Phase", type: "range", default: 0, min: 0, max: 6.28, step: 0.01 },
    { key: "mix", label: "Mix", type: "range", default: 0.5, min: 0, max: 1, step: 0.01 },
  ],
  apply(gray, w, h, p) {
    const base = p.delay as number;
    const depth = p.depth as number;
    const freq = p.freq as number;
    const phase = p.phase as number;
    const mix = p.mix as number;
    const out = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const d = base + depth * Math.sin(2 * Math.PI * ((y / h) * freq) + phase);
      for (let x = 0; x < w; x++) out[row + x] = clamp01(gray[row + x] * (1 - mix) + sampleX(gray, w, row, x - d) * mix);
    }
    return out;
  },
};

// CHORUS — several detuned modulated voices averaged with the dry signal: thick shimmer.
const chorus: Filter = {
  id: "chorus",
  name: "Chorus",
  category: "signal",
  params: [
    { key: "delay", label: "Delay px", type: "range", default: 14, min: 2, max: 80, step: 1 },
    { key: "depth", label: "Depth", type: "range", default: 8, min: 0, max: 40, step: 1 },
    { key: "voices", label: "Voices", type: "range", default: 3, min: 1, max: 5, step: 1 },
    { key: "phase", label: "Phase", type: "range", default: 0, min: 0, max: 6.28, step: 0.01 },
    { key: "mix", label: "Mix", type: "range", default: 0.6, min: 0, max: 1, step: 0.01 },
  ],
  apply(gray, w, h, p) {
    const base = p.delay as number;
    const depth = p.depth as number;
    const voices = Math.max(1, Math.round(p.voices as number));
    const t = p.phase as number;
    const mix = p.mix as number;
    const out = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      // per-voice modulated delay, detuned by voice index
      const ds: number[] = [];
      for (let v = 0; v < voices; v++) {
        const f = 0.6 + v * 0.37;
        ds.push(base + depth * Math.sin(2 * Math.PI * ((y / h) * f) + t * (1 + v * 0.3) + v));
      }
      for (let x = 0; x < w; x++) {
        let wet = 0;
        for (let v = 0; v < voices; v++) wet += sampleX(gray, w, row, x - ds[v]);
        wet /= voices;
        out[row + x] = clamp01(gray[row + x] * (1 - mix) + wet * mix);
      }
    }
    return out;
  },
};

export const SIGNAL_FX: Filter[] = [echo, distortion, lowpass, highpass, flanger, chorus];
