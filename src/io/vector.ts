import type { VectorScene } from "../filters/types";

// Serialize a VectorScene (ink primitives on a white ground) to SVG or PDF. Both are
// dependency-free. Coordinates are image pixels; 1px maps to 1 unit (pt) in the PDF.

const KAPPA = 0.5522847498307936; // circle-to-Bézier control ratio

export function sceneToSVG(scene: VectorScene): string {
  const { w, h, prims } = scene;
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="#fff"/>`,
    `<g fill="#000" stroke="#000">`,
  ];
  for (const p of prims) {
    if (p.t === "circle") out.push(`<circle cx="${f(p.cx)}" cy="${f(p.cy)}" r="${f(p.r)}"/>`);
    else if (p.t === "rect") out.push(`<rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h)}"/>`);
    else out.push(`<line x1="${f(p.x1)}" y1="${f(p.y1)}" x2="${f(p.x2)}" y2="${f(p.y2)}" stroke-width="${f(p.sw)}"/>`);
  }
  out.push(`</g></svg>`);
  return out.join("\n");
}

export function sceneToPDF(scene: VectorScene): Uint8Array {
  const { w, h, prims } = scene;
  // build the content stream (PDF origin is bottom-left, so flip y)
  const fy = (y: number) => h - y;
  const cs: string[] = ["1 1 1 rg", `0 0 ${f(w)} ${f(h)} re f`, "0 0 0 rg", "0 0 0 RG"];
  for (const p of prims) {
    if (p.t === "circle") cs.push(circlePath(p.cx, fy(p.cy), p.r) + " f");
    else if (p.t === "rect") cs.push(`${f(p.x)} ${f(fy(p.y + p.h))} ${f(p.w)} ${f(p.h)} re f`);
    else cs.push(`${f(p.sw)} w ${f(p.x1)} ${f(fy(p.y1))} m ${f(p.x2)} ${f(fy(p.y2))} l S`);
  }
  const content = cs.join("\n");

  // assemble objects, tracking byte offsets for the xref table
  const objs = [
    `<</Type/Catalog/Pages 2 0 R>>`,
    `<</Type/Pages/Kids[3 0 R]/Count 1>>`,
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${f(w)} ${f(h)}]/Contents 4 0 R>>`,
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
  ];
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
