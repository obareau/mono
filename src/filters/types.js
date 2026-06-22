// Core filter abstraction.
//
// The whole app is one pipeline:  source image -> grayscale buffer -> [filters] -> output.
// A "grayscale buffer" is a Float32Array of length w*h, each value in [0,1] (0 = black, 1 = white).
// Most filters transform that buffer. Dithering filters collapse it to exactly 0 or 1.
// A "terminal" filter (e.g. ASCII) does not output pixels — it renders its own representation.
/** Build a default param-values object from a filter definition. */
export function defaultParams(f) {
    const out = {};
    for (const d of f.params)
        out[d.key] = d.default;
    return out;
}
