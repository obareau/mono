// Hard 1-bit threshold — the most MacPaint thing there is.
export const threshold = {
    id: "threshold",
    name: "Threshold",
    category: "dither",
    params: [
        { key: "level", label: "Level", type: "range", default: 0.5, min: 0, max: 1, step: 0.01 },
    ],
    apply(gray, _w, _h, p) {
        const t = p.level;
        for (let i = 0; i < gray.length; i++)
            gray[i] = gray[i] >= t ? 1 : 0;
        return gray;
    },
};
