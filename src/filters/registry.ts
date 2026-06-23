import type { Filter } from "./types";
import { photoFilter } from "./photoFilter";
import { tone } from "./tone";
import { SIGNAL_FX } from "./signalFx";
import { threshold } from "./threshold";
import { errorDiffusion } from "./floydSteinberg";
import { thresholdMap } from "./thresholdMap";
import { ostromoukhov } from "./ostromoukhov";
import { riemersma } from "./riemersma";
import { bayer } from "./bayer";
import { blueNoise } from "./blueNoise";
import { patterns } from "./patterns";
import { halftone } from "./halftone";
import { clusteredDot } from "./clusteredDot";
import { concentric } from "./concentric";
import { stipple } from "./stipple";
import { hatch } from "./hatch";
import { contour } from "./contour";
import { xdog } from "./xdog";
import { gravure } from "./gravure";
import { mezzotint } from "./mezzotint";
import { GEOMETRY } from "./geometry";
import { truchet } from "./truchet";
import { circlePack } from "./circlePack";
import { warp } from "./warp";
import { DISRUPTORS } from "./disruptors";
import { offset } from "./offset";
import { ascii } from "./ascii";

// Single source of truth. Add a filter here and it appears in the UI automatically —
// controls are generated from each filter's `params` declaration.
export const FILTERS: Filter[] = [
  photoFilter,
  tone,
  ...SIGNAL_FX,
  threshold,
  errorDiffusion,
  ostromoukhov,
  riemersma,
  bayer,
  thresholdMap,
  mezzotint,
  blueNoise,
  patterns,
  halftone,
  clusteredDot,
  concentric,
  stipple,
  hatch,
  contour,
  xdog,
  gravure,
  ...GEOMETRY,
  truchet,
  circlePack,
  warp,
  ...DISRUPTORS,
  offset,
  ascii,
];

export function getFilter(id: string): Filter | undefined {
  return FILTERS.find((f) => f.id === id);
}
