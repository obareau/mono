import type { Filter, TerminalRender } from "./types";

// ASCII art (terminal filter). The image is reduced to a grid of cells; each cell's
// brightness picks a glyph from a user-supplied ramp string. The ramp IS the medium —
// type "MONO" or "@%#*+=-:. " or anything; characters are ordered dark -> light by default.

const CHAR_ASPECT = 0.6; // monospace advance width / line height

export const ascii: Filter = {
  id: "ascii",
  name: "ASCII",
  category: "ascii",
  terminal: true,
  params: [
    { key: "ramp", label: "Characters", type: "text", default: "@%#*+=-:. " },
    { key: "cols", label: "Columns", type: "range", default: 120, min: 16, max: 400, step: 1, ticks: [80, 120] },
    { key: "invert", label: "Invert ramp", type: "toggle", default: false },
    { key: "darkBg", label: "Dark background", type: "toggle", default: false },
  ],
  render(gray, w, h, p): TerminalRender {
    let ramp = (p.ramp as string) || " ";
    if (ramp.length < 1) ramp = " ";
    if (p.invert as boolean) ramp = [...ramp].reverse().join("");
    const cols = Math.max(1, Math.round(p.cols as number));
    const darkBg = p.darkBg as boolean;
    // rows derive from image aspect + glyph aspect so text and canvas agree exactly.
    const rows = Math.max(1, Math.round((cols * (h / w)) * CHAR_ASPECT));
    const cellW = w / cols;
    const cellH = h / rows;
    const maxIdx = ramp.length - 1;

    // build the glyph grid once — shared by canvas draw and .txt export.
    const lines: string[] = [];
    for (let row = 0; row < rows; row++) {
      let line = "";
      const y0 = Math.floor(row * cellH);
      const y1 = Math.min(h, Math.floor((row + 1) * cellH));
      for (let col = 0; col < cols; col++) {
        let sum = 0;
        let n = 0;
        const x0 = Math.floor(col * cellW);
        const x1 = Math.min(w, Math.floor((col + 1) * cellW));
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            sum += gray[yy * w + xx];
            n++;
          }
        }
        const lum = n ? sum / n : 1;
        // dark pixel (lum~0) -> first char of ramp (densest by convention, e.g. '@')
        const idx = Math.min(maxIdx, Math.max(0, Math.round(lum * maxIdx)));
        line += ramp[idx];
      }
      lines.push(line);
    }

    return {
      text() {
        return lines.join("\n");
      },
      html() {
        const esc = lines.join("\n").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const bg = darkBg ? "#000" : "#fff";
        const fg = darkBg ? "#fff" : "#000";
        return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>MONO° ASCII</title>
<style>html,body{margin:0;background:${bg}}
pre{font:12px/1 "SFMono-Regular",Menlo,Consolas,monospace;color:${fg};padding:20px;white-space:pre;letter-spacing:0}</style>
</head><body><pre>${esc}</pre></body></html>`;
      },
      draw(ctx, outW, outH) {
        const fontSize = outW / cols / CHAR_ASPECT;
        const lineH = outH / rows;
        ctx.fillStyle = darkBg ? "#000" : "#fff";
        ctx.fillRect(0, 0, outW, outH);
        ctx.fillStyle = darkBg ? "#fff" : "#000";
        ctx.textBaseline = "top";
        ctx.font = `${fontSize}px "SFMono-Regular", "Menlo", "Consolas", monospace`;
        const colW = outW / cols;
        for (let row = 0; row < rows; row++) {
          const line = lines[row];
          for (let col = 0; col < cols; col++) {
            const ch = line[col];
            if (ch && ch !== " ") ctx.fillText(ch, col * colW, row * lineH);
          }
        }
      },
    };
  },
};
