// Export options shared by the export dialog and the writers. The workbench stays strictly
// B&W; colour (ink/paper) and page geometry are applied only at export time.

export type ExportFormat = "png" | "svg" | "pdf" | "txt" | "html";
export type ExportScale = "1x" | "2x" | "native" | "custom";
export type PageSize = "fit" | "a4" | "letter";
export type PdfMode = "fit" | "tile";

export interface ExportOptions {
  format: ExportFormat;
  scale: ExportScale;
  customPx: number; // long-edge pixels when scale === "custom"
  transparent: boolean; // paper → transparent (raster + SVG)
  invert: boolean; // swap ink and paper
  ink: string; // hex, the colour black maps to
  paper: string; // hex, the colour white maps to
  // PDF page geometry
  pageSize: PageSize;
  marginMM: number;
  pdfMode: PdfMode; // fit to one page, or tile at DPI across pages
  dpi: number; // physical scale for tile mode
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: "png",
  scale: "native",
  customPx: 2000,
  transparent: false,
  invert: false,
  ink: "#000000",
  paper: "#ffffff",
  pageSize: "fit",
  marginMM: 10,
  pdfMode: "fit",
  dpi: 300,
};

// Effective ink/paper after the invert toggle (invert just swaps the two colours).
export interface InkStyle {
  ink: string;
  paper: string;
  transparent: boolean;
}
export function effectiveStyle(o: ExportOptions): InkStyle {
  return { ink: o.invert ? o.paper : o.ink, paper: o.invert ? o.ink : o.paper, transparent: o.transparent };
}
/** True when the style differs from plain black-on-white opaque (so we can skip recolouring). */
export function isPlainStyle(s: InkStyle): boolean {
  return !s.transparent && s.ink.toLowerCase() === "#000000" && s.paper.toLowerCase() === "#ffffff";
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const v = parseInt(n, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export interface PdfOptions {
  pageSize: PageSize;
  marginMM: number;
  mode: PdfMode;
  dpi: number;
  ink: string;
  paper: string;
  transparent: boolean;
}

export const MM_TO_PT = 72 / 25.4;
export const PAGE_PT: Record<Exclude<PageSize, "fit">, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

const LS_KEY = "mono:export";

export function loadExportOptions(): ExportOptions {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...DEFAULT_EXPORT_OPTIONS, ...JSON.parse(raw) } : { ...DEFAULT_EXPORT_OPTIONS };
  } catch {
    return { ...DEFAULT_EXPORT_OPTIONS };
  }
}

export function saveExportOptions(o: ExportOptions): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}
