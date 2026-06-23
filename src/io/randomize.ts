import { FILTERS } from "../filters/registry";
import type { Filter, ParamDef, ParamValues } from "../filters/types";
import type { PresetItem } from "./presets";

// Builds a sensible, seeded random stack: an optional tone/colour prep, one base
// dither/screen/geometry filter, and (sometimes) one disruptor at reduced opacity.
// Seeded so the same stack is reproducible; the realized stack shares via COPY LINK.

// mulberry32 — tiny deterministic PRNG (0..1).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(pool: T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length)];
}

// Randomize one param within its declared range, biased to the middle to avoid
// degenerate extremes. Text/mask params are left to their defaults (setStack merges).
function randParam(def: ParamDef, rng: () => number): number | boolean | string | undefined {
  switch (def.type) {
    case "range": {
      const min = def.min ?? 0;
      const max = def.max ?? 1;
      const step = def.step ?? 0;
      let v = min + (0.15 + rng() * 0.7) * (max - min);
      if (step) v = Math.round(v / step) * step;
      return Number(v.toFixed(4));
    }
    case "toggle":
      return rng() < 0.5;
    case "select":
      return def.options?.length ? pick(def.options, rng) : undefined;
    default:
      return undefined; // text (ramps), mask — keep the filter's default
  }
}

function randItem(pool: Filter[], rng: () => number, opacity = 1): PresetItem {
  const f = pick(pool, rng);
  const params: ParamValues = {};
  for (const def of f.params) {
    const v = randParam(def, rng);
    if (v !== undefined) params[def.key] = v;
  }
  return { filterId: f.id, params, enabled: true, opacity };
}

const inCat = (...cats: string[]) => FILTERS.filter((f) => cats.includes(f.category) && !f.terminal);

/** Build a random stack. Pass a seed for reproducibility; omit for a fresh one. */
export function randomStack(seed: number = (Math.random() * 0xffffffff) >>> 0): PresetItem[] {
  const rng = mulberry32(seed);
  const items: PresetItem[] = [];

  const preps = inCat("tone", "color");
  if (preps.length && rng() < 0.6) items.push(randItem(preps, rng));

  const bases = inCat("dither", "screen", "geometry");
  if (bases.length) items.push(randItem(bases, rng));

  const disruptors = inCat("disrupt", "signal");
  if (disruptors.length && rng() < 0.4) items.push(randItem(disruptors, rng, 0.4 + rng() * 0.4));

  return items;
}
