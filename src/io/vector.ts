import type { VectorScene } from "../filters/types";
import { hexToRgb, MM_TO_PT, PAGE_PT, type InkStyle, type PdfOptions } from "./export";

// Serialize a VectorScene (ink primitives on a paper ground) to SVG or PDF. Both are
// dependency-free. Coordinates are image pixels; the PDF can fit-to-page or tile at a DPI.

const KAPPA = 0.5522847498307936; // circle-to-Bézier control ratio

export function sceneToSVG(scene: VectorScene, style?: InkStyle): string {
  const { w, h, prims } = scene;
  const ink = style?.ink ?? "#000000";
  const paper = style?.paper ?? "#ffffff";
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
  ];
  if (!style?.transparent) out.push(`<rect width="${w}" height="${h}" fill="${paper}"/>`);
  out.push(`<g fill="${ink}" stroke="${ink}">`);
  for (const p of prims) {
    if (p.t === "circle") out.push(`<circle cx="${f(p.cx)}" cy="${f(p.cy)}" r="${f(p.r)}"/>`);
    else if (p.t === "rect") out.push(`<rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h)}"/>`);
    else out.push(`<line x1="${f(p.x1)}" y1="${f(p.y1)}" x2="${f(p.x2)}" y2="${f(p.y2)}" stroke-width="${f(p.sw)}"/>`);
  }
  out.push(`</g></svg>`);
  return out.join("\n");
}

// rg/RG colour operator components (0..1) from a hex string.
function rgb01(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${f(r / 255)} ${f(g / 255)} ${f(b / 255)}`;
}

// Draw the scene's marks in image-local coordinates with a bottom-left origin (PDF space).
function buildMarks(scene: VectorScene): string {
  const { h, prims } = scene;
  const fy = (y: number) => h - y;
  const cs: string[] = [];
  for (const p of prims) {
    if (p.t === "circle") cs.push(circlePath(p.cx, fy(p.cy), p.r) + " f");
    else if (p.t === "rect") cs.push(`${f(p.x)} ${f(fy(p.y + p.h))} ${f(p.w)} ${f(p.h)} re f`);
    else cs.push(`${f(p.sw)} w ${f(p.x1)} ${f(fy(p.y1))} m ${f(p.x2)} ${f(fy(p.y2))} l S`);
  }
  return cs.join("\n");
}

interface Page {
  w: number;
  h: number;
  content: string;
}

// One placed page: paper fill, ink colour, then the marks scaled by s and offset to (ox, oy),
// optionally clipped to a content rectangle (for tiling).
function placePage(
  marks: string, opts: PdfOptions,
  pw: number, ph: number, s: number, ox: number, oy: number,
  clip?: [number, number, number, number],
): Page {
  const cs: string[] = [];
  if (!opts.transparent) cs.push(`${rgb01(opts.paper)} rg`, `0 0 ${f(pw)} ${f(ph)} re f`);
  cs.push(`${rgb01(opts.ink)} rg`, `${rgb01(opts.ink)} RG`, "q");
  if (clip) cs.push(`${f(clip[0])} ${f(clip[1])} ${f(clip[2])} ${f(clip[3])} re W n`);
  cs.push(`${f(s)} 0 0 ${f(s)} ${f(ox)} ${f(oy)} cm`, marks, "Q");
  return { w: pw, h: ph, content: cs.join("\n") };
}

function layoutPages(scene: VectorScene, opts: PdfOptions): Page[] {
  const marks = buildMarks(scene);
  const m = opts.marginMM * MM_TO_PT;
  const { w: iw, h: ih } = scene;

  if (opts.pageSize === "fit" || opts.mode === "fit") {
    // single page: fit the image (at 1pt/px for "fit", or scaled to the chosen sheet)
    let pw: number, ph: number, s: number;
    if (opts.pageSize === "fit") {
      s = opts.mode === "tile" ? 72 / opts.dpi : 1;
      pw = iw * s + 2 * m;
      ph = ih * s + 2 * m;
    } else {
      [pw, ph] = orient(PAGE_PT[opts.pageSize], iw, ih);
      s = Math.min((pw - 2 * m) / iw, (ph - 2 * m) / ih);
    }
    const ox = (pw - iw * s) / 2;
    const oy = (ph - ih * s) / 2;
    return [placePage(marks, opts, pw, ph, s, ox, oy)];
  }

  // tile: print at the chosen DPI across as many sheets as needed
  const [pw, ph] = orient(PAGE_PT[opts.pageSize], iw, ih);
  const s = 72 / opts.dpi;
  const cw = pw - 2 * m, ch = ph - 2 * m;
  const cols = Math.max(1, Math.ceil((iw * s) / cw));
  const rows = Math.max(1, Math.ceil((ih * s) / ch));
  const pages: Page[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ox = m - c * cw;
      const oy = m + ch - ih * s + r * ch;
      pages.push(placePage(marks, opts, pw, ph, s, ox, oy, [m, m, cw, ch]));
    }
  }
  return pages;
}

// Match sheet orientation to the image aspect to waste less paper.
function orient([pw, ph]: [number, number], iw: number, ih: number): [number, number] {
  return iw > ih ? [Math.max(pw, ph), Math.min(pw, ph)] : [Math.min(pw, ph), Math.max(pw, ph)];
}

const DEFAULT_PDF: PdfOptions = {
  pageSize: "fit", marginMM: 0, mode: "fit", dpi: 72, ink: "#000000", paper: "#ffffff", transparent: false,
};

export function sceneToPDF(scene: VectorScene, options?: PdfOptions): Uint8Array {
  const opts = options ?? DEFAULT_PDF;
  const pages = layoutPages(scene, opts);

  // objects: 1 Catalog, 2 Pages, then per page a Page object and a Contents object
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  const objs: string[] = [
    `<</Type/Catalog/Pages 2 0 R>>`,
    `<</Type/Pages/Kids[${kids}]/Count ${pages.length}>>`,
  ];
  pages.forEach((pg, i) => {
    objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${f(pg.w)} ${f(pg.h)}]/Contents ${4 + i * 2} 0 R/Resources<<>>>>`);
    objs.push(`<</Length ${pg.content.length}>>\nstream\n${pg.content}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

function circlePath(cx: number, cy: number, r: number): string {
  const k = r * KAPPA;
  // start at right, four cubic Béziers counter-clockwise
  return [
    `${f(cx + r)} ${f(cy)} m`,
    `${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c`,
    `${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} c`,
    `${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c`,
    `${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} c`,
  ].join(" ");
}

function f(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

export function downloadText(text: string, name: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadBytes(bytes: Uint8Array, name: string, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
