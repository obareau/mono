import type { ParamValues } from "../filters/types";

// A preset is just the filter stack, serialized. We keep it tiny so it fits in a URL hash:
// short keys, base64 of JSON. localStorage autosaves the working stack between sessions.

export interface PresetItem {
  filterId: string;
  params: ParamValues;
  enabled: boolean;
  opacity?: number;
}

const LS_KEY = "mono:stack";
const HASH_KEY = "s";

function b64encode(json: string): string {
  return btoa(unescape(encodeURIComponent(json)));
}
function b64decode(b64: string): string {
  return decodeURIComponent(escape(atob(b64)));
}

export function encodePreset(items: PresetItem[]): string {
  const compact = items.map((i) => ({ f: i.filterId, p: i.params, e: i.enabled, o: i.opacity ?? 1 }));
  return b64encode(JSON.stringify(compact));
}

export function decodePreset(b64: string): PresetItem[] | null {
  try {
    const arr = JSON.parse(b64decode(b64)) as { f: string; p: ParamValues; e: boolean; o?: number }[];
    if (!Array.isArray(arr)) return null;
    return arr.map((o) => ({ filterId: o.f, params: o.p ?? {}, enabled: o.e !== false, opacity: o.o ?? 1 }));
  } catch {
    return null;
  }
}

/** Build a shareable URL carrying the current stack in its hash. */
export function shareURL(items: PresetItem[]): string {
  const url = new URL(window.location.href);
  url.hash = `${HASH_KEY}=${encodePreset(items)}`;
  return url.toString();
}

/** Read a stack from the location hash (#s=...), if present. */
export function loadFromHash(): PresetItem[] | null {
  const m = window.location.hash.match(new RegExp(`${HASH_KEY}=([^&]+)`));
  return m ? decodePreset(m[1]) : null;
}

// Starter presets shown in the left panel — one-click filter stacks. Params are partial;
// store.setStack() merges them with each filter's defaults.
export interface NamedPreset {
  name: string;
  items: PresetItem[];
}
const fx = (filterId: string, params: ParamValues = {}, opacity = 1): PresetItem => ({ filterId, params, enabled: true, opacity });
export const STARTER_PRESETS: NamedPreset[] = [
  { name: "Floyd", items: [fx("tone", { contrast: 0.15 }), fx("error-diffusion", { kernel: "Floyd-Steinberg" })] },
  { name: "Atkinson", items: [fx("error-diffusion", { kernel: "Atkinson" })] },
  { name: "Ostro", items: [fx("ostromoukhov")] },
  { name: "Halftone", items: [fx("halftone", { cell: 6, angle: 45 })] },
  { name: "Stipple", items: [fx("stipple", { mode: "poisson", spacing: 9, dotSize: 3 })] },
  { name: "Bayer", items: [fx("bayer", { size: "4" })] },
  { name: "Crosshatch", items: [fx("hatch", { mode: "crosshatch", spacing: 6 })] },
  { name: "Contour", items: [fx("contour", { levels: 10 })] },
  { name: "ASCII", items: [fx("ascii", { ramp: "@%#*+=-:. ", cols: 120 })] },
  { name: "Low-Poly", items: [fx("triangulate", { cell: 24 }), fx("error-diffusion", { kernel: "Atkinson" }, 0.6)] },
];

export function saveLocal(items: PresetItem[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    /* storage may be unavailable (private mode) — ignore */
  }
}

export function loadLocal(): PresetItem[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as PresetItem[]) : null;
  } catch {
    return null;
  }
}
