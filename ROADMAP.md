# Roadmap

**Status — v1 shipped.** Tier 1 + Tier 2 done, all ongoing filters shipped, and a product
pass (PWA, social preview, mobile). MONO° has **45 filters**, exports PNG/SVG/PDF/TXT/HTML,
shareable stacks, and is live at <https://obareau.github.io/mono/>.

---

# v1.x — planned (next)

Now that features are rich, the goal shifts from *more filters* to making the tool **pleasant
to use with 42 filters** and **hardening** it. Recommended order: A → B → C, with D ongoing.

## Lane A — workflow depth ✅

- [x] **Undo / redo.** History ring of serialized stack states; pushes on structural change and
      (debounced) on value change; UNDO/REDO buttons + `Ctrl/Cmd+Z` / `Shift+…+Z` / `Ctrl+Y`.
- [x] **User presets.** Save the current stack under a name → localStorage list; a "MY PRESETS"
      group in the left panel with apply/delete and export/import of a preset file.
- [x] **Filter browser search + favourites.** A search box filters the (now long) left list
      live (by name + category); star a filter → a Favourites group pinned at the top.
- [x] **Randomize.** RANDOM (in the PRESETS header) builds a sensible seeded stack — an
      optional tone/colour prep, one base dither/screen/geometry, sometimes a disruptor at
      reduced opacity; params biased to the middle of each range. Realized stack shares as usual.
- [x] **Canvas niceties.** Hold **B** for before/after (shows the colour source); wheel zoom
      toward the cursor + drag to pan + double-click / **0** to reset; shortcuts **O** open,
      **E** export PNG, **R** randomize (undo/redo via ⌘Z/⇧⌘Z).

## Lane B — performance (Web Worker) ✅

- [x] **Run the pipeline off the main thread.** Source planes are sent to the worker once per
      image; each change posts the serialized stack + a request id and gets the gray buffer
      back (transferred). At most one run is in flight and requests coalesce to the latest
      stack, so results are never stale and the UI never freezes — important now that
      Engraving (LIC), Circle Pack and big stacks are heavy. ASCII/terminal render and
      `toVector` export stay on the main thread (worker returns the buffer + a terminal
      marker); custom threshold-map masks are synced to the worker. Falls back to a
      synchronous run if a Worker can't be created.
- [x] This unblocks **Reaction-Diffusion** (heavy, iterative) and any future costly filter.

## Lane C — pro / print output ✅

- [x] **Export dialog.** A single EXPORT… button opens a modal: format (auto-limited to PNG /
      SVG / PDF / TXT / HTML by what the stack supports), scale (1× / 2× / native / custom px),
      background (white / transparent), invert. Options persist in localStorage.
- [x] **Riso "ink" export.** The workbench stays strictly B&W, but on export black → a chosen
      spot ink and white → a paper colour (e.g. orange on cream) for PNG (pixel recolour) and
      SVG/PDF (fill colours) — directly useful for zines / risograph. Invert swaps ink/paper.
- [x] **Print-ready PDF.** Page size (Fit / A4 / Letter, auto-oriented), margins (mm), and
      fit-to-page or tile-at-DPI across multiple sheets. Dependency-free writer.

## Lane D — new filters (ongoing)

- [x] Clean Sobel edge detect (thinned) — gradient magnitude + non-maximum suppression +
      hard threshold; distinct from XDoG / Contour Shock.
- [x] More halftone variants — added **diamond** (L1 disc) and **ellipse** (newspaper) screen
      shapes alongside the existing dot/square/line + angle controls.
- [x] Image-seeded Voronoi (**Voronoi (tone)**) — seed density follows tone (dart-thrown on a
      fine grid, denser where dark), nearest-seed via spatial hash, cells flat-filled.
- [x] Reaction-Diffusion (Gray-Scott) — runs on a downscaled grid then upscales, tuned dt /
      Laplacian, seeded from the image; heavy + iterative, so it lives behind the Lane-B worker.

---

# v1 history

Ordered by leverage, not by how fun it is. The point of Tier 1 was to make MONO°
**usable and shareable** before deepening the engine.

## Tier 1 — ship soon, highest leverage

- [x] **Live deploy (GitHub Pages).** CI Action builds and publishes `dist/` on every push
      to main. Live at <https://obareau.github.io/mono/>, linked at the top of the README.
- [x] **Full-resolution export.** Preview stays at 1024px; EXPORT PNG re-runs the stack at
      the source's native resolution (capped at 4096) from the kept original bitmap.
- [x] **Stack presets (save / load / share).** Stack autosaves to localStorage and can be
      shared via a `#s=` URL hash (COPY LINK button); shared links restore on load.

## Tier 2 — print-grade output

- [x] **Vector export (SVG / PDF).** Dependency-free SVG and PDF writers. Halftone,
      Clustered Dot, and the new Stipple filter emit resolution-independent dots; EXPORT
      SVG/PDF appear when such a filter is in the stack and run at native resolution.
      Hatch also exports as variable-width line segments — every screen now vectorizes.

## New filter batch (v1.1) ✅

- [x] **XDoG Ink** — difference-of-Gaussians line drawing
- [x] **Engraving** — flow-based (LIC) hatching that follows image forms
- [x] **Truchet** — tone-driven arc/diagonal tiles
- [x] **Circle Pack** — tone-density disc packing, vector-exportable
- [x] **Mezzotint** — stochastic random-dot screening
- [x] **Warp** — ripple / swirl / pinch / wave distortions
- [x] **Concentric** — ring/spiral rosette halftone, vector-exportable
- [x] **Voronoi Lines** — cell-boundary crackle net
- [ ] Reaction-Diffusion (Gray-Scott) — drafted but deferred: Turing presets are
      unstable/slow on the live preview; needs dt tuning + a worker before shipping

## Ongoing — filters — all shipped ✅

- [x] Voronoi tessellation (jittered seeds, nearest-cell flat fill)
- [x] Contour / topographic iso-luminance lines (optional band shading)
- [x] True Poisson-disk stippling (variable-radius Bridson, density follows tone) — a
      "poisson" mode on the Stipple filter, alongside size/density
- [x] Hatch vector export — variable-width line segments (lines/crosshatch/spiral)
- [x] Custom **threshold-map** dithering — load any image as the dither screen (Bayer fallback)
- [x] ASCII export to a standalone styled HTML page

## Scope — MONO° is a still-image tool

Motion belongs in the companion VJ tool
[terminal-synth](https://github.com/obareau/terminal-synth), which imports photos, videos and
GIFs and shares the same disruptor vocabulary. So the following are **not planned here**:

- **Animation / Play mode, GIF & video (WebM) export.** Removed — drifts from MONO°'s focus.
- **WebGL2 shader rewrite.** The CPU pipeline is fast enough (1024px live preview, full-res
  export). Not worth rewriting ~24 working filters as shaders. If real lag ever appears,
  move the pipeline into a Web Worker instead (far cheaper).
- **Inter-frame feedback disruptors** (Datamosh, Frame Hold, Sync Lost, Signal Loss) — needs
  motion; lives in terminal-synth.
- **Live audio-reactive mode** — no value for a still-image tool.
