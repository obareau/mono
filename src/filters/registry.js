import { tone } from "./tone";
import { threshold } from "./threshold";
import { errorDiffusion } from "./floydSteinberg";
import { bayer } from "./bayer";
import { halftone } from "./halftone";
import { offset } from "./offset";
import { ascii } from "./ascii";
// Single source of truth. Add a filter here and it appears in the UI automatically —
// controls are generated from each filter's `params` declaration.
export const FILTERS = [
    tone,
    threshold,
    errorDiffusion,
    bayer,
    halftone,
    offset,
    ascii,
];
export function getFilter(id) {
    return FILTERS.find((f) => f.id === id);
}
