import { el } from "./controls";
import {
  type ExportFormat, type ExportOptions,
  loadExportOptions, saveExportOptions,
} from "../io/export";

// A small modal for choosing export format + options. Replaces the row of one-shot buttons.

export interface ExportContext {
  formats: ExportFormat[]; // which formats are available for the current stack
  onExport: (o: ExportOptions) => void;
}

const FORMAT_LABEL: Record<ExportFormat, string> = {
  png: "PNG (raster)", svg: "SVG (vector)", pdf: "PDF (print)", txt: "TXT (ASCII)", html: "HTML (ASCII)",
};

export function openExportDialog(ctx: ExportContext): void {
  const o = loadExportOptions();
  if (!ctx.formats.includes(o.format)) o.format = ctx.formats[0] ?? "png";

  const overlay = el("div", "modal-overlay");
  const panel = el("div", "modal");
  const title = el("div", "modal-title");
  title.textContent = "EXPORT";
  const body = el("div", "modal-body");
  const foot = el("div", "modal-foot");

  const cancel = button("CANCEL", "", close);
  const go = button("EXPORT", "primary", () => { saveExportOptions(o); close(); ctx.onExport(o); });
  foot.append(cancel, go);
  panel.append(title, body, foot);
  overlay.appendChild(panel);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  renderBody();

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Enter") { e.preventDefault(); saveExportOptions(o); close(); ctx.onExport(o); }
  }
  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  function renderBody() {
    body.innerHTML = "";
    body.appendChild(selectRow("Format", o.format, ctx.formats.map((fmt) => [fmt, FORMAT_LABEL[fmt]]), (v) => { o.format = v as ExportFormat; renderBody(); }));

    const raster = o.format === "png";
    const colourable = o.format === "png" || o.format === "svg" || o.format === "pdf";

    if (raster) {
      body.appendChild(selectRow("Scale", o.scale, [["1x", "1× preview"], ["2x", "2×"], ["native", "Native"], ["custom", "Custom px"]], (v) => { o.scale = v as ExportOptions["scale"]; renderBody(); }));
      if (o.scale === "custom") body.appendChild(numberRow("Long edge (px)", o.customPx, { min: 16, max: 8192, step: 1 }, (v) => (o.customPx = v)));
    }

    if (o.format === "png" || o.format === "svg") {
      body.appendChild(checkRow("Transparent background", o.transparent, (v) => (o.transparent = v)));
    }

    if (colourable) {
      body.appendChild(checkRow("Invert (swap ink / paper)", o.invert, (v) => (o.invert = v)));
      body.appendChild(colorRow("Ink (black →)", o.ink, (v) => (o.ink = v)));
      if (!o.transparent || o.format === "pdf") body.appendChild(colorRow("Paper (white →)", o.paper, (v) => (o.paper = v)));
    }

    if (o.format === "pdf") {
      body.appendChild(divider("PRINT"));
      body.appendChild(selectRow("Page size", o.pageSize, [["fit", "Fit to image"], ["a4", "A4"], ["letter", "Letter"]], (v) => { o.pageSize = v as ExportOptions["pageSize"]; renderBody(); }));
      body.appendChild(numberRow("Margin (mm)", o.marginMM, { min: 0, max: 50, step: 1 }, (v) => (o.marginMM = v)));
      if (o.pageSize !== "fit") {
        body.appendChild(selectRow("Layout", o.pdfMode, [["fit", "Fit to one page"], ["tile", "Tile at DPI"]], (v) => { o.pdfMode = v as ExportOptions["pdfMode"]; renderBody(); }));
      }
      if (o.pdfMode === "tile" || o.pageSize === "fit") {
        body.appendChild(numberRow("DPI", o.dpi, { min: 72, max: 1200, step: 1 }, (v) => (o.dpi = v)));
      }
    }
  }
}

// ---- field builders ----

function field(label: string, control: HTMLElement): HTMLElement {
  const row = el("label", "modal-row");
  const name = el("span", "modal-label");
  name.textContent = label;
  row.append(name, control);
  return row;
}

function selectRow(label: string, value: string, options: [string, string][], onChange: (v: string) => void): HTMLElement {
  const sel = document.createElement("select");
  sel.className = "modal-input";
  for (const [val, lbl] of options) {
    const opt = document.createElement("option");
    opt.value = val; opt.textContent = lbl;
    if (val === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  return field(label, sel);
}

function numberRow(label: string, value: number, opts: { min: number; max: number; step: number }, onChange: (v: number) => void): HTMLElement {
  const input = document.createElement("input");
  input.type = "number";
  input.className = "modal-input";
  input.min = String(opts.min); input.max = String(opts.max); input.step = String(opts.step);
  input.value = String(value);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    if (Number.isFinite(v)) onChange(Math.min(opts.max, Math.max(opts.min, v)));
  });
  return field(label, input);
}

function colorRow(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  const input = document.createElement("input");
  input.type = "color";
  input.className = "modal-color";
  input.value = value;
  input.addEventListener("input", () => onChange(input.value));
  return field(label, input);
}

function checkRow(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value;
  input.addEventListener("change", () => onChange(input.checked));
  const row = el("label", "modal-row modal-check");
  const name = el("span", "modal-label");
  name.textContent = label;
  row.append(input, name);
  return row;
}

function divider(text: string): HTMLElement {
  const d = el("div", "modal-divider");
  d.textContent = text;
  return d;
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = `btn ${cls}`.trim();
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}
