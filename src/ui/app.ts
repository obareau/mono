import { store } from "../state/store";
import { FILTERS, getFilter } from "../filters/registry";
import type { Filter } from "../filters/types";
import { runPipeline, runToVector, lastVectorIndex } from "../engine/pipeline";
import { downscale } from "../engine/pipelineCache";
import { renderToCanvas, exportPNG, exportText, recolorCanvas } from "../io/render";
import { sceneToSVG, sceneToPDF, downloadText, downloadBytes } from "../io/vector";
import { effectiveStyle, isPlainStyle, type ExportOptions, type ExportFormat } from "../io/export";
import { openExportDialog } from "./exportDialog";
import {
  shareURL, STARTER_PRESETS,
  loadUserPresets, saveUserPreset, deleteUserPreset, exportUserPresets, importUserPresets,
  loadFavourites, toggleFavourite,
} from "../io/presets";
import { randomStack } from "../io/randomize";
import { getMasksVersion, allMasks } from "../io/maskStore";
import type { PipelineResult } from "../engine/pipeline";
import { loadImageFile, fromBitmap } from "../io/loadImage";
import { buildControl, el } from "./controls";

// Renders the whole interface and keeps the canvas in sync with the store.
export function mountApp(root: HTMLElement): void {
  root.innerHTML = "";

  // ---- layout ----
  const header = el("header", "topbar");
  header.innerHTML = `<span class="logo">MONO<b>°</b></span><span class="tag">1-BIT IMAGE WORKBENCH</span>`;
  const headerRight = el("div", "topbar-right");
  header.appendChild(headerRight);

  // three-panel Lightroom-style layout: filter browser | canvas | stack
  const main = el("div", "layout");
  const left = el("aside", "panel-left");
  const stage = el("div", "stage");

  // canvas lives inside a classic Mac window (pinstripe title bar + close box)
  const win = el("div", "window");
  const winbar = el("div", "winbar");
  winbar.innerHTML = `<span class="close-box"></span><span class="win-title">untitled-1</span>`;
  const canvasWrap = el("div", "canvas-wrap");
  const canvas = document.createElement("canvas");
  canvas.className = "output";
  canvasWrap.appendChild(canvas);
  win.appendChild(winbar);
  win.appendChild(canvasWrap);
  const stageInner = el("div", "stage-inner");
  const dropHint = el("div", "drop-hint");
  dropHint.textContent = "⤓  DROP YOUR IMAGE HERE  ·  PASTE  ·  OR “OPEN IMAGE”";
  stageInner.append(win, dropHint);
  stage.appendChild(stageInner);

  const side = el("aside", "sidebar");

  // mobile tab bar — CSS reveals it only on narrow screens; toggles which panel is shown
  // while the canvas stays pinned above. On desktop both panels are always visible.
  const tabs = el("div", "mobile-tabs");
  const tabFilters = btn("FILTERS", "tab", () => setTab("filters"));
  const tabStack = btn("STACK", "tab", () => setTab("stack"));
  tabs.append(tabFilters, tabStack);
  function setTab(t: "filters" | "stack") {
    main.dataset.tab = t;
    tabFilters.classList.toggle("on", t === "filters");
    tabStack.classList.toggle("on", t === "stack");
  }

  main.appendChild(left);
  main.appendChild(stage);
  main.appendChild(side);
  main.appendChild(tabs);
  root.appendChild(header);
  root.appendChild(main);

  // ---- top bar actions ----
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (f) store.setSource(await loadImageFile(f));
  });
  root.appendChild(fileInput);

  let lastResult: PipelineResult | null = null;
  // export availability, refreshed each render — drives the dialog's format list
  let hasVector = false, hasTermText = false, hasTermHtml = false;
  const openBtn = btn("OPEN IMAGE", "primary", () => fileInput.click());

  const EXPORT_MAX = 4096;
  const previewLongEdge = () => Math.max(store.source!.w, store.source!.h);
  const nativeLongEdge = () => Math.min(EXPORT_MAX, Math.max(store.source!.natW, store.source!.natH));
  function targetLongEdge(o: ExportOptions): number {
    switch (o.scale) {
      case "1x": return previewLongEdge();
      case "2x": return Math.min(EXPORT_MAX, previewLongEdge() * 2);
      case "native": return nativeLongEdge();
      default: return Math.min(8192, Math.max(16, Math.round(o.customPx)));
    }
  }

  // PNG: re-run the stack at the chosen resolution (terminal results just rescale), then
  // recolour for ink/paper/transparent if the style isn't plain black-on-white.
  function exportRaster(o: ExportOptions) {
    const src = store.source!;
    const off = document.createElement("canvas");
    if (lastResult?.terminal) renderToCanvas(off, lastResult, targetLongEdge(o) / previewLongEdge());
    else if (src.bitmap) renderToCanvas(off, runPipeline(fromBitmap(src.bitmap, targetLongEdge(o)), store.stack));
    else renderToCanvas(off, runPipeline(src, store.stack));
    const style = effectiveStyle(o);
    if (!isPlainStyle(style)) recolorCanvas(off, style);
    exportPNG(off, "mono.png");
  }

  // SVG/PDF: re-run to the last vector-capable filter at native resolution, then write.
  function exportVectorFile(o: ExportOptions) {
    const src = store.source!;
    const hiSrc = src.bitmap ? fromBitmap(src.bitmap, nativeLongEdge()) : src;
    const scene = runToVector(hiSrc, store.stack);
    if (!scene) return;
    const style = effectiveStyle(o);
    if (o.format === "svg") downloadText(sceneToSVG(scene, style), "mono.svg", "image/svg+xml");
    else downloadBytes(
      sceneToPDF(scene, { pageSize: o.pageSize, marginMM: o.marginMM, mode: o.pdfMode, dpi: o.dpi, ink: style.ink, paper: style.paper, transparent: style.transparent }),
      "mono.pdf", "application/pdf",
    );
  }

  function runExport(o: ExportOptions) {
    if (!store.source) return;
    try {
      if (o.format === "png") exportRaster(o);
      else if (o.format === "svg" || o.format === "pdf") exportVectorFile(o);
      else if (o.format === "txt") { const t = lastResult?.terminal?.text?.(); if (t) exportText(t, "mono.txt"); }
      else if (o.format === "html") { const h = lastResult?.terminal?.html?.(); if (h) downloadText(h, "mono.html", "text/html"); }
    } catch (err) {
      console.warn("[mono] export failed:", err);
      toast("Export failed — try a smaller scale or a different format");
    }
  }

  function openExport() {
    if (!store.source) return;
    const formats: ExportFormat[] = ["png"];
    if (hasVector) formats.push("svg", "pdf");
    if (hasTermText) formats.push("txt");
    if (hasTermHtml) formats.push("html");
    openExportDialog({ formats, onExport: runExport });
  }
  const exportBtn = btn("EXPORT…", "", openExport);
  const shareBtn = btn("COPY LINK", "", async () => {
    const url = shareURL(store.serialize());
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      shareBtn.textContent = "COPIED ✓";
      setTimeout(() => (shareBtn.textContent = "COPY LINK"), 1200);
    } catch {
      shareBtn.textContent = "COPY LINK";
    }
  });
  const undoBtn = btn("UNDO", "", () => store.undo());
  const redoBtn = btn("REDO", "", () => store.redo());
  undoBtn.title = "Undo (⌘Z / Ctrl+Z)";
  redoBtn.title = "Redo (⇧⌘Z / Ctrl+Y)";
  function updateHistoryButtons() {
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
  }
  store.subscribeHistory(updateHistoryButtons);
  updateHistoryButtons();

  const helpBtn = btn("?", "", openHelp);
  helpBtn.title = "Keyboard & gestures (?)";
  headerRight.append(openBtn, undoBtn, redoBtn, shareBtn, exportBtn, helpBtn);

  // keyboard: undo / redo (ignore while typing in a text field)
  window.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && (target as HTMLInputElement).type === "text"))) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); store.undo(); }
    else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); store.redo(); }
  });

  // drag & drop + paste
  stage.addEventListener("dragover", (e) => {
    e.preventDefault();
    stage.classList.add("dragging");
  });
  stage.addEventListener("dragleave", () => stage.classList.remove("dragging"));
  stage.addEventListener("drop", async (e) => {
    e.preventDefault();
    stage.classList.remove("dragging");
    const f = e.dataTransfer?.files?.[0];
    if (f) store.setSource(await loadImageFile(f));
  });
  window.addEventListener("paste", async (e) => {
    const f = e.clipboardData?.files?.[0];
    if (f) store.setSource(await loadImageFile(f));
  });

  // wheel to zoom toward the cursor; drag to pan; double-click to reset
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  canvasWrap.addEventListener("wheel", (e) => {
    if (!store.source) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const ox = e.clientX - rect.left;
    const oy = e.clientY - rect.top;
    const newZoom = clamp(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.2, 8);
    const k = newZoom / zoom;
    panX += ox * (1 - k);
    panY += oy * (1 - k);
    zoom = newZoom;
    applyTransform();
  }, { passive: false });

  let panning = false, lastX = 0, lastY = 0;
  canvasWrap.addEventListener("mousedown", (e) => {
    if (!store.source) return;
    panning = true; lastX = e.clientX; lastY = e.clientY;
    canvasWrap.classList.add("panning");
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!panning) return;
    panX += e.clientX - lastX; panY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    applyTransform();
  });
  window.addEventListener("mouseup", () => { panning = false; canvasWrap.classList.remove("panning"); });
  canvasWrap.addEventListener("dblclick", () => { if (store.source) resetView(); });

  // touch: one finger pans, two fingers pinch-zoom toward their midpoint, double-tap resets
  let tMode: "none" | "pan" | "pinch" = "none";
  let tx = 0, ty = 0, tDist = 0, lastTap = 0;
  const dist2 = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  canvasWrap.addEventListener("touchstart", (e) => {
    if (!store.source) return;
    if (e.touches.length === 1) {
      tMode = "pan"; tx = e.touches[0].clientX; ty = e.touches[0].clientY;
      const now = Date.now();
      if (now - lastTap < 300) { resetView(); lastTap = 0; } else lastTap = now;
    } else if (e.touches.length >= 2) {
      tMode = "pinch";
      tDist = dist2(e.touches[0], e.touches[1]);
      tx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      ty = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
    e.preventDefault();
  }, { passive: false });
  canvasWrap.addEventListener("touchmove", (e) => {
    if (tMode === "none" || !store.source) return;
    e.preventDefault();
    if (tMode === "pan" && e.touches.length === 1) {
      const t = e.touches[0];
      panX += t.clientX - tx; panY += t.clientY - ty;
      tx = t.clientX; ty = t.clientY;
      applyTransform();
    } else if (tMode === "pinch" && e.touches.length >= 2) {
      const d = dist2(e.touches[0], e.touches[1]);
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = canvas.getBoundingClientRect();
      const newZoom = clamp(zoom * (d / (tDist || d)), 0.2, 8);
      const k = newZoom / zoom;
      panX += (mx - rect.left) * (1 - k) + (mx - tx); // zoom toward midpoint + pan with it
      panY += (my - rect.top) * (1 - k) + (my - ty);
      zoom = newZoom; tDist = d; tx = mx; ty = my;
      applyTransform();
    }
  }, { passive: false });
  canvasWrap.addEventListener("touchend", (e) => {
    if (e.touches.length === 0) tMode = "none";
    else if (e.touches.length === 1) { tMode = "pan"; tx = e.touches[0].clientX; ty = e.touches[0].clientY; }
  });

  // single-key shortcuts: O open · E export · R randomize · 0 reset zoom · hold B for before/after
  const isTyping = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT");
  };
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
    switch (e.key.toLowerCase()) {
      case "o": e.preventDefault(); fileInput.click(); break;
      case "e": if (store.source) { e.preventDefault(); openExport(); } break;
      case "r": e.preventDefault(); store.setStack(randomStack()); break;
      case "0": if (store.source) { e.preventDefault(); resetView(); } break;
      case "b": if (store.source && !showSource) { e.preventDefault(); showSource = true; redraw(); } break;
      case "?": e.preventDefault(); openHelp(); break;
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key.toLowerCase() === "b" && showSource) { showSource = false; redraw(); }
  });

  // ---- view: zoom / pan / before-after ----
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let showSource = false; // hold to compare against the original
  let lastSource: typeof store.source = null; // reset the view when a new image loads

  function applyTransform() {
    canvas.style.transformOrigin = "0 0";
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }
  function resetView() {
    zoom = 1; panX = 0; panY = 0;
    applyTransform();
  }

  // Draw the untouched (colour) source — the "before" of the comparison.
  function drawSource() {
    const src = store.source!;
    canvas.width = src.w;
    canvas.height = src.h;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(src.w, src.h);
    const d = img.data;
    for (let i = 0, j = 0; i < src.gray.length; i++, j += 4) {
      d[j] = Math.round(src.r[i] * 255);
      d[j + 1] = Math.round(src.g[i] * 255);
      d[j + 2] = Math.round(src.b[i] * 255);
      d[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---- render ----
  function drawPlaceholder() {
    canvas.style.transform = "";
    canvas.width = 640;
    canvas.height = 400;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 640, 400);
    ctx.fillStyle = "#999";
    ctx.font = '14px "SFMono-Regular", Menlo, monospace';
    ctx.textAlign = "center";
    ctx.fillText("DROP · PASTE · OPEN AN IMAGE", 320, 200);
  }

  // Paint a finished pipeline result and sync the export buttons to it.
  function applyPipelineResult(result: PipelineResult) {
    lastResult = result;
    hasTermText = !!result.terminal?.text;
    hasTermHtml = !!result.terminal?.html;
    hasVector = lastVectorIndex(store.stack) >= 0;
    renderToCanvas(canvas, result);
    applyTransform();
  }

  // transient status pill (render errors, fallbacks) — non-blocking
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  function toast(message: string) {
    let t = root.querySelector(".toast") as HTMLElement | null;
    if (!t) { t = el("div", "toast"); root.appendChild(t); }
    t.textContent = message;
    t.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t!.classList.remove("show"), 2600);
  }

  // The pipeline runs in a Web Worker so heavy filters (Engraving/LIC, Circle Pack, big
  // stacks) never freeze the UI. We keep at most one run in flight and coalesce to the
  // latest stack, so results are never stale. Falls back to a synchronous run if the
  // worker can't be created.
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL("../engine/pipeline.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  let busy = false;       // a run is in flight
  let pending = false;    // a newer run was requested while busy
  let reqId = 0;
  let sentSource: typeof store.source = null;
  let sentMaskVersion = -1;
  let quality: "low" | "high" = "high"; // "low" while dragging a slider (faster preview)
  let interactTimer: ReturnType<typeof setTimeout> | null = null;
  const RENDER_FAIL = "Render failed — check that filter's settings";

  // run the stack synchronously on the main thread (worker fallback), guarding throws
  function renderSync() {
    try {
      applyPipelineResult(runPipeline(store.source!, store.stack));
    } catch (err) {
      console.warn("[mono] render failed:", err);
      toast(RENDER_FAIL);
    }
  }

  function requestRender() {
    if (!worker) { renderSync(); return; }
    if (busy) { pending = true; return; }
    if (store.source !== sentSource) {
      const s = store.source!;
      worker.postMessage({ type: "source", gray: s.gray, r: s.r, g: s.g, b: s.b, w: s.w, h: s.h });
      sentSource = store.source;
    }
    if (getMasksVersion() !== sentMaskVersion) {
      worker.postMessage({ type: "masks", masks: allMasks() });
      sentMaskVersion = getMasksVersion();
    }
    busy = true;
    worker.postMessage({ type: "run", reqId: ++reqId, stack: store.serialize(), quality });
  }

  if (worker) {
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type !== "result" && msg?.type !== "error") return;
      busy = false; // always release the in-flight lock so the UI never wedges
      if (msg.type === "error") {
        console.warn("[mono] filter render failed:", msg.message);
        toast(RENDER_FAIL); // keep the last good frame on screen
      } else if (store.source && !showSource) {
        try {
          const gray: Float32Array = msg.gray;
          let terminal;
          if (msg.terminal) {
            const f = getFilter(msg.terminal.filterId);
            terminal = f?.render?.(gray, msg.w, msg.h, msg.terminal.params);
          }
          applyPipelineResult({ gray, w: msg.w, h: msg.h, terminal });
        } catch (err) {
          console.warn("[mono] terminal render failed:", err);
          toast(RENDER_FAIL);
        }
      }
      if (pending) { pending = false; requestRender(); } // retry with the latest stack
    };
    // a fatal worker crash: drop to synchronous rendering for the rest of the session
    worker.onerror = (ev) => {
      console.error("[mono] worker crashed, falling back to main thread:", ev.message);
      worker = null;
      busy = false;
      toast("Renderer fell back to the main thread");
      redraw();
    };
  }

  function redraw() {
    if (!store.source) { drawPlaceholder(); return; }
    if (store.source !== lastSource) { lastSource = store.source; resetView(); }
    if (showSource) { drawSource(); applyTransform(); return; }
    requestRender();
  }

  // Value changes (slider drags) render the fast low-res tier; once the drag settles for a
  // moment, re-render at full quality.
  function redrawInteractive() {
    quality = "low";
    redraw();
    if (interactTimer) clearTimeout(interactTimer);
    interactTimer = setTimeout(() => { quality = "high"; redraw(); }, 200);
  }

  // ---- left panel: filter browser, grouped by category (static) ----
  const CATEGORY_LABELS: Record<string, string> = {
    color: "COLOR", tone: "TONE", signal: "SIGNAL FX", dither: "DITHER",
    screen: "SCREENS", geometry: "GEOMETRY", disrupt: "DISRUPTORS", ascii: "ASCII",
  };
  // hidden file input for importing a preset file
  const presetFileInput = document.createElement("input");
  presetFileInput.type = "file";
  presetFileInput.accept = "application/json,.json";
  presetFileInput.style.display = "none";
  presetFileInput.addEventListener("change", async () => {
    const f = presetFileInput.files?.[0];
    presetFileInput.value = ""; // allow re-importing the same file
    if (!f) return;
    const merged = importUserPresets(await f.text());
    if (merged) renderLeft();
    else alert("Could not read that preset file.");
  });
  root.appendChild(presetFileInput);

  function saveCurrentStack() {
    if (!store.stack.length) { alert("The stack is empty — add a filter first."); return; }
    const name = prompt("Save this stack as:")?.trim();
    if (!name) return;
    saveUserPreset(name, store.serialize());
    renderLeft();
  }

  // live filter-browser search; kept across re-renders, applied without a rebuild so focus survives
  let filterQuery = "";

  // a filter chip: click to add, star to favourite. Tagged for the search filter.
  function filterChip(f: Filter): HTMLButtonElement {
    const b = btn(f.name.toUpperCase(), "chip filter-chip", () => store.addFilter(f.id));
    b.textContent = "";
    b.dataset.name = f.name.toLowerCase();
    b.dataset.cat = (CATEGORY_LABELS[f.category] ?? f.category).toLowerCase();
    const label = el("span", "chip-label");
    label.textContent = f.name.toUpperCase();
    const isFav = loadFavourites().includes(f.id);
    const star = el("span", `star${isFav ? " on" : ""}`);
    star.textContent = isFav ? "★" : "☆";
    star.title = isFav ? "Remove from favourites" : "Add to favourites";
    star.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavourite(f.id);
      renderLeft();
    });
    b.append(label, star);
    return b;
  }

  // hide chips/sections that don't match the query (no rebuild → search keeps focus)
  function filterBrowser() {
    const q = filterQuery.trim().toLowerCase();
    left.querySelectorAll<HTMLElement>(".browse-section").forEach((section) => {
      let any = false;
      section.querySelectorAll<HTMLElement>(".filter-chip").forEach((chip) => {
        const match = !q || (chip.dataset.name ?? "").includes(q) || (chip.dataset.cat ?? "").includes(q);
        chip.style.display = match ? "" : "none";
        if (match) any = true;
      });
      section.style.display = any ? "" : "none";
    });
  }

  function renderLeft() {
    left.innerHTML = "";

    // one-click starter presets
    const pre = el("section", "panel");
    const ph = heading("PRESETS");
    ph.appendChild(btn("RANDOM", "mini", () => store.setStack(randomStack())));
    pre.appendChild(ph);
    const pgrid = el("div", "palette two");
    for (const preset of STARTER_PRESETS) {
      pgrid.appendChild(btn(preset.name.toUpperCase(), "chip", () => store.setStack(preset.items)));
    }
    pre.appendChild(pgrid);
    left.appendChild(pre);

    // user presets: save the current stack, apply / delete saved ones, import / export
    const mine = el("section", "panel");
    const mh = heading("MY PRESETS");
    mh.appendChild(btn("SAVE", "mini", saveCurrentStack));
    const userPresets = loadUserPresets();
    if (userPresets.length) mh.appendChild(btn("EXPORT", "mini", () => downloadText(exportUserPresets(userPresets), "mono-presets.json", "application/json")));
    mh.appendChild(btn("IMPORT", "mini", () => presetFileInput.click()));
    mine.appendChild(mh);
    if (!userPresets.length) {
      const empty = el("p", "empty");
      empty.textContent = "Save the current stack to reuse it later.";
      mine.appendChild(empty);
    } else {
      for (const preset of userPresets) {
        const row = el("div", "preset-row");
        const apply = btn(preset.name, "chip", () => store.setStack(preset.items));
        apply.title = `Apply "${preset.name}"`;
        const del = iconBtn("✕", `Delete "${preset.name}"`, () => {
          if (confirm(`Delete preset "${preset.name}"?`)) { deleteUserPreset(preset.name); renderLeft(); }
        });
        row.append(apply, del);
        mine.appendChild(row);
      }
    }
    left.appendChild(mine);

    // search box over the (long) filter list
    const searchPanel = el("section", "panel");
    const search = document.createElement("input");
    search.type = "search";
    search.className = "search";
    search.placeholder = "Search filters…";
    search.value = filterQuery;
    search.addEventListener("input", () => { filterQuery = search.value; filterBrowser(); });
    searchPanel.appendChild(search);
    left.appendChild(searchPanel);

    // favourites pinned at the top
    const favs = loadFavourites();
    if (favs.length) {
      const favSect = el("section", "panel browse-section");
      favSect.appendChild(heading("★ FAVOURITES"));
      const grid = el("div", "palette");
      for (const id of favs) {
        const f = getFilter(id);
        if (f) grid.appendChild(filterChip(f));
      }
      favSect.appendChild(grid);
      left.appendChild(favSect);
    }

    const seen = new Set<string>();
    for (const f of FILTERS) {
      if (!seen.has(f.category)) {
        seen.add(f.category);
        const sect = el("section", "panel browse-section");
        sect.appendChild(heading(CATEGORY_LABELS[f.category] ?? f.category.toUpperCase()));
        const grid = el("div", "palette");
        for (const g of FILTERS.filter((x) => x.category === f.category)) grid.appendChild(filterChip(g));
        sect.appendChild(grid);
        left.appendChild(sect);
      }
    }

    filterBrowser(); // apply the current query to the freshly built list
  }

  // ---- right panel: the active stack ----
  let dragUid: number | null = null; // filter card currently being dragged (pointer reorder)

  // Small rendered preview of the pipeline up to (and including) a stack index — used as the
  // drag image. Runs synchronously on a tiny downscaled source, so it's cheap.
  const THUMB = 96;
  function thumbnailFor(idx: number): HTMLCanvasElement | null {
    if (!store.source) return null;
    try {
      const result = runPipeline(downscale(store.source, THUMB), store.stack.slice(0, idx + 1));
      const c = document.createElement("canvas");
      renderToCanvas(c, result);
      c.className = "drag-thumb";
      return c;
    } catch {
      return null;
    }
  }

  function renderSidebar() {
    side.innerHTML = "";

    const stackPanel = el("section", "panel");
    const h = heading(`STACK · ${store.stack.length}`);
    if (store.stack.length) {
      const clear = btn("CLEAR", "mini", () => store.clear());
      h.appendChild(clear);
    }
    stackPanel.appendChild(h);

    if (!store.stack.length) {
      const empty = el("p", "empty");
      empty.textContent = "No filters. Pick one from the left — they apply top to bottom.";
      stackPanel.appendChild(empty);
    }

    store.stack.forEach((item, idx) => {
      const f = getFilter(item.filterId)!;
      const card = el("div", "fcard");
      card.dataset.uid = String(item.uid); // read by touch reorder (elementFromPoint)
      if (!item.enabled) card.classList.add("off");
      if (f.terminal) card.classList.add("terminal");

      // drag-to-reorder by the title bar, via Pointer Events so mouse + touch share one path
      // (no fragile HTML5 DnD / native snap-back; the drop target is the nearest card so the
      // gaps between cards work too).
      const bar = el("div", "fcard-bar");
      const clearTargets = () => side.querySelectorAll(".fcard.drop-target").forEach((c) => c.classList.remove("drop-target"));
      const cardUnder = (x: number, y: number) =>
        (document.elementFromPoint(x, y) as HTMLElement | null)?.closest(".fcard") as HTMLElement | null;
      let ghost: HTMLElement | null = null; // floating label following the pointer
      const moveGhost = (x: number, y: number) => { if (ghost) { ghost.style.left = `${x}px`; ghost.style.top = `${y}px`; } };
      bar.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;     // primary button only
        if ((e.target as HTMLElement).closest(".fcard-tools")) return; // let the tool buttons work
        dragUid = item.uid;
        card.classList.add("dragging-card");
        ghost = el("div", "drag-ghost");
        const thumb = thumbnailFor(idx);
        if (thumb) ghost.appendChild(thumb);
        const label = el("div", "drag-ghost-label");
        label.innerHTML = `<i>${String(idx + 1).padStart(2, "0")}</i> ${f.name}`;
        ghost.appendChild(label);
        document.body.appendChild(ghost);
        moveGhost(e.clientX, e.clientY);
        try { bar.setPointerCapture(e.pointerId); } catch { /* no active pointer (synthetic) */ }
        e.preventDefault();
      });
      bar.addEventListener("pointermove", (e) => {
        if (dragUid !== item.uid) return;
        moveGhost(e.clientX, e.clientY);
        const over = cardUnder(e.clientX, e.clientY);
        clearTargets();
        if (over && over !== card) over.classList.add("drop-target");
      });
      const endDrag = (e: PointerEvent) => {
        if (dragUid !== item.uid) return;
        const over = cardUnder(e.clientX, e.clientY);
        clearTargets();
        card.classList.remove("dragging-card");
        ghost?.remove(); ghost = null;
        const toUid = over && over !== card ? Number(over.dataset.uid) : 0;
        dragUid = null;
        if (toUid) store.reorder(item.uid, toUid);
      };
      bar.addEventListener("pointerup", endDrag);
      bar.addEventListener("pointercancel", endDrag);

      const title = el("span", "fcard-title");
      title.innerHTML = `<i>${String(idx + 1).padStart(2, "0")}</i> ${f.name}`;
      bar.appendChild(title);

      const tools = el("div", "fcard-tools");
      tools.append(
        iconBtn("↑", "Move up", () => store.move(item.uid, -1)),
        iconBtn("↓", "Move down", () => store.move(item.uid, 1)),
        iconBtn(item.enabled ? "●" : "○", "Toggle", () => store.toggleFilter(item.uid)),
        iconBtn("✕", "Remove", () => store.removeFilter(item.uid)),
      );
      bar.appendChild(tools);
      card.appendChild(bar);

      const body = el("div", "fcard-body");
      // per-filter opacity (skip terminal filters — they don't blend)
      if (!f.terminal) body.appendChild(opacityRow(item));
      for (const def of f.params) body.appendChild(buildControl(item, def));
      card.appendChild(body);
      stackPanel.appendChild(card);
    });

    side.appendChild(stackPanel);
  }

  function updateStackTab() {
    tabStack.textContent = store.stack.length ? `STACK · ${store.stack.length}` : "STACK";
  }
  // store.emit() (structural) fires the render listeners too, so flag structural ticks to
  // keep the interactive (low-res) path for genuine value changes only.
  let structuralTick = false;
  store.subscribe(() => {
    renderSidebar();
    updateStackTab();
    quality = "high"; // structural changes always render at full quality
    redraw();
    structuralTick = true;
    queueMicrotask(() => { structuralTick = false; });
  });
  store.subscribeRender(() => {
    if (structuralTick) return; // already rendered at full quality by the structural handler
    redrawInteractive();
  });

  setTab("filters");
  updateStackTab();
  renderLeft();
  renderSidebar();
  redraw();
}

// Keyboard & gesture cheatsheet (opened by the ? key or the ? button).
function openHelp(): void {
  if (document.querySelector(".help-overlay")) return;
  const overlay = el("div", "modal-overlay help-overlay");
  const panel = el("div", "modal");
  const title = el("div", "modal-title");
  title.textContent = "KEYBOARD & GESTURES";
  const body = el("div", "modal-body help-body");
  const rows: [string, string][] = [
    ["O", "Open image"],
    ["E", "Export…"],
    ["R", "Randomize the stack"],
    ["B", "Hold to compare with the source"],
    ["0", "Reset zoom & pan"],
    ["⌘/Ctrl + Z", "Undo"],
    ["⇧ + ⌘/Ctrl + Z", "Redo"],
    ["Scroll / pinch", "Zoom the canvas"],
    ["Drag / two-finger", "Pan the canvas"],
    ["Double-click / -tap", "Reset the view"],
    ["Drag a filter's title", "Reorder the stack"],
    ["Esc", "Close dialogs"],
  ];
  for (const [k, d] of rows) {
    const row = el("div", "help-row");
    const kbd = el("span", "kbd");
    kbd.textContent = k;
    const desc = el("span", "help-desc");
    desc.textContent = d;
    row.append(kbd, desc);
    body.appendChild(row);
  }
  const foot = el("div", "modal-foot");
  const close = () => { document.removeEventListener("keydown", onKey); overlay.remove(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
  foot.appendChild(btn("CLOSE", "primary", close));
  panel.append(title, body, foot);
  overlay.appendChild(panel);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}

function btn(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = `btn ${cls}`.trim();
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function iconBtn(glyph: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "ibtn";
  b.textContent = glyph;
  b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

function opacityRow(item: { uid: number; opacity?: number }): HTMLElement {
  const row = el("label", "ctl");
  const name = el("span", "ctl-label");
  name.textContent = "Mix";
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "1";
  input.step = "0.01";
  input.value = String(item.opacity ?? 1);
  const val = el("span", "ctl-val");
  const fmt = (n: number) => `${Math.round(n * 100)}%`;
  val.textContent = fmt(item.opacity ?? 1);
  input.addEventListener("input", () => {
    val.textContent = fmt(parseFloat(input.value));
    store.setOpacity(item.uid, parseFloat(input.value));
  });
  row.append(name, input, val);
  return row;
}

function heading(text: string): HTMLElement {
  const h = el("div", "phead");
  const span = el("span");
  span.textContent = text;
  h.appendChild(span);
  return h;
}
