// Offset / misregistration. Two flavours of the classic mis-printed look:
//  - "echo": overlay a shifted ghost of the image, combined like layered ink.
//  - "slices": shove horizontal bands sideways for a torn / scan-shifted glitch.
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export const offset = {
    id: "offset",
    name: "Offset",
    category: "offset",
    params: [
        { key: "mode", label: "Mode", type: "select", default: "echo", options: ["echo", "slices"] },
        { key: "dx", label: "Shift X", type: "range", default: 6, min: -64, max: 64, step: 1 },
        { key: "dy", label: "Shift Y", type: "range", default: 0, min: -64, max: 64, step: 1 },
        { key: "blend", label: "Blend", type: "select", default: "multiply", options: ["multiply", "screen", "difference"] },
        { key: "bands", label: "Slice count", type: "range", default: 24, min: 2, max: 120, step: 1 },
        { key: "chaos", label: "Chaos", type: "range", default: 0.5, min: 0, max: 1, step: 0.01 },
        { key: "seed", label: "Seed", type: "range", default: 1, min: 1, max: 999, step: 1 },
    ],
    apply(gray, w, h, p) {
        const mode = p.mode;
        if (mode === "slices")
            return slices(gray, w, h, p);
        return echo(gray, w, h, p);
    },
};
function combine(a, b, blend) {
    switch (blend) {
        case "screen":
            return 1 - (1 - a) * (1 - b);
        case "difference":
            return Math.abs(a - b);
        default: // multiply
            return a * b;
    }
}
function echo(gray, w, h, p) {
    const dx = p.dx;
    const dy = p.dy;
    const blend = p.blend;
    const out = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const sx = x - dx;
            const sy = y - dy;
            const ghost = sx >= 0 && sx < w && sy >= 0 && sy < h ? gray[sy * w + sx] : 1; // out-of-bounds = white (no ink)
            out[i] = Math.min(1, Math.max(0, combine(gray[i], ghost, blend)));
        }
    }
    return out;
}
function slices(gray, w, h, p) {
    const bands = p.bands;
    const chaos = p.chaos;
    const maxShift = p.dx;
    const rng = mulberry32(p.seed);
    const out = new Float32Array(gray.length);
    const bandH = Math.max(1, Math.floor(h / bands));
    for (let y = 0; y < h; y++) {
        const band = Math.floor(y / bandH);
        // deterministic shift per band
        const r = mulberry32(p.seed * 7919 + band)();
        const shift = Math.round((r * 2 - 1) * Math.abs(maxShift) * (0.2 + 0.8 * chaos));
        for (let x = 0; x < w; x++) {
            const sx = ((x - shift) % w + w) % w; // wrap
            out[y * w + x] = gray[y * w + sx];
        }
    }
    void rng;
    return out;
}
