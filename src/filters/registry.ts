import type { Filter } from "./types";
import { photoFilter } from "./photoFilter";
import { tone } from "./tone";
import { threshold } from "./threshold";
import { errorDiffusion } from "./floydSteinberg";
import { ostromoukhov } from "./ostromoukhov";
import { riemersma } from "./riemersma";
import { bayer } from "./bayer";
import { blueNoise } from "./blueNoise";
import { patterns } from "./patterns";
import { halftone } from "./halftone";
import { clusteredDot } from "./clusteredDot";
import { hatch } from "./hatch";
import { DISRUPTORS } from "./disruptors";
import { offset } from "./offset";
import { ascii } from "./ascii";

// Single source of truth. Add a filter here and it appears in the UI automatically —
// controls are generated from each filter's `params` declaration.
export const FILTERS: Filter[] = [
  photoFilter,
  tone,
  threshold,
  errorDiffusion,
  ostromoukhov,
  riemersma,
  bayer,
  blueNoise,
  patterns,
  halftone,
  clusteredDot,
  hatch,
  ...DISRUPTORS,
  offset,
  ascii,
];

export function getFilter(id: string): Filter | undefined {
  return FILTERS.find((f) => f.id === id);
}
