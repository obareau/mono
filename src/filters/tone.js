// Brightness / contrast / invert — tonal prep before dithering or screening.
export const tone = {
    id: "tone",
    name: "Tone",
    category: "tone",
    params: [
        { key: "brightness", label: "Brightness", type: "range", default: 0, min: -1, max: 1, step: 0.01 },
        { key: "contrast", label: "Contrast", type: "range", default: 0, min: -1, max: 1, step: 0.01 },
        { key: "gamma", label: "Gamma", type: "range", default: 1, min: 0.2, max: 3, step: 0.01 },
        { key: "invert", label: "Invert", type: "toggle", default: false },
    ],
    apply(gray, _w, _h, p) {
        const b = p.brightness;
        const c = p.contrast;
        const g = p.gamma;
        const inv = p.invert;
        // contrast factor (standard formula, c in [-1,1])
        const cf = (1.015 * (c + 1)) / (1.015 - c);
        for (let i = 0; i < gray.length; i++) {
            let v = gray[i] + b;
            v = cf * (v - 0.5) + 0.5;
            v = Math.min(1, Math.max(0, v));
            v = Math.pow(v, 1 / g);
            if (inv)
                v = 1 - v;
            gray[i] = Math.min(1, Math.max(0, v));
        }
        return gray;
    },
};
