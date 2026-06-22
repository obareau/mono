import type { Filter } from "./types";

// Ostromoukhov variable-coefficient error diffusion (SIGGRAPH 2001).
// Instead of one fixed kernel, the three distribution weights change with the pixel's
// intensity — the coefficients were optimised offline so each tone's Fourier spectrum
// approaches a blue-noise profile. Result: error diffusion with almost no worm/structure
// artefacts, very even grain.
//
// Error goes to three neighbours:  east (x+1,y), south-west (x-1,y+1), south (x,y+1).
// Coefficients below are A10, A-11, A01 for input levels 0..127, transcribed from the
// paper's Appendix I; levels 128..255 use the mirror D(i) = D(255 - i).

// prettier-ignore
const COEFFS: [number, number, number][] = [
  [13,0,5],[13,0,5],[21,0,10],[7,0,4],[8,0,5],[47,3,28],[23,3,13],[15,3,8],
  [22,6,11],[43,15,20],[7,3,3],[501,224,211],[249,116,103],[165,80,67],[123,62,49],[489,256,191],
  [81,44,31],[483,272,181],[60,35,22],[53,32,19],[237,148,83],[471,304,161],[3,2,1],[481,314,185],
  [354,226,155],[1389,866,685],[227,138,125],[267,158,163],[327,188,220],[61,34,45],[627,338,505],[1227,638,1075],
  [20,10,19],[1937,1000,1767],[977,520,855],[657,360,551],[71,40,57],[2005,1160,1539],[337,200,247],[2039,1240,1425],
  [257,160,171],[691,440,437],[1045,680,627],[301,200,171],[177,120,95],[2141,1480,1083],[1079,760,513],[725,520,323],
  [137,100,57],[2209,1640,855],[53,40,19],[2243,1720,741],[565,440,171],[759,600,209],[1147,920,285],[2311,1880,513],
  [97,80,19],[335,280,57],[1181,1000,171],[793,680,95],[599,520,57],[2413,2120,171],[405,360,19],[2447,2200,57],
  [11,10,0],[158,151,3],[178,179,7],[1030,1091,63],[248,277,21],[318,375,35],[458,571,63],[878,1159,147],
  [5,7,1],[172,181,37],[97,76,22],[72,41,17],[119,47,29],[4,1,1],[4,1,1],[4,1,1],
  [4,1,1],[4,1,1],[4,1,1],[4,1,1],[4,1,1],[4,1,1],[65,18,17],[95,29,26],
  [185,62,53],[30,11,9],[35,14,11],[85,37,28],[55,26,19],[80,41,29],[155,86,59],[5,3,2],
  [5,3,2],[5,3,2],[5,3,2],[5,3,2],[5,3,2],[5,3,2],[5,3,2],[5,3,2],
  [5,3,2],[5,3,2],[5,3,2],[5,3,2],[305,176,119],[155,86,59],[105,56,39],[80,41,29],
  [65,32,23],[55,26,19],[335,152,113],[85,37,28],[115,48,37],[35,14,11],[355,136,109],[30,11,9],
  [365,128,107],[185,62,53],[25,8,7],[95,29,26],[385,112,103],[65,18,17],[395,104,101],[4,1,1],
];

export const ostromoukhov: Filter = {
  id: "ostromoukhov",
  name: "Ostromoukhov",
  category: "dither",
  params: [
    { key: "level", label: "Level", type: "range", default: 0.5, min: 0.05, max: 0.95, step: 0.01 },
    { key: "serpentine", label: "Serpentine", type: "toggle", default: true },
  ],
  apply(gray, w, h, p) {
    const level = p.level as number;
    const serpentine = p.serpentine as boolean;
    for (let y = 0; y < h; y++) {
      const ltr = !serpentine || y % 2 === 0;
      const xStart = ltr ? 0 : w - 1;
      const xEnd = ltr ? w : -1;
      const step = ltr ? 1 : -1;
      for (let x = xStart; x !== xEnd; x += step) {
        const i = y * w + x;
        const v = gray[i];
        const out = v >= level ? 1 : 0;
        gray[i] = out;
        const err = v - out;
        if (err === 0) continue;
        // coefficients keyed on the (clamped) intensity level, mirrored past mid-grey
        let lvl = Math.round(v * 255);
        lvl = lvl < 0 ? 0 : lvl > 255 ? 255 : lvl;
        const c = COEFFS[lvl <= 127 ? lvl : 255 - lvl];
        const m = c[0] + c[1] + c[2];
        if (m === 0) continue;
        const e = err / m;
        const east = ltr ? 1 : -1; // mirror horizontal directions on R-to-L rows
        spread(gray, w, h, x + east, y, e * c[0]);
        spread(gray, w, h, x - east, y + 1, e * c[1]);
        spread(gray, w, h, x, y + 1, e * c[2]);
      }
    }
    return gray;
  },
};

function spread(gray: Float32Array, w: number, h: number, x: number, y: number, add: number) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  gray[y * w + x] += add;
}
