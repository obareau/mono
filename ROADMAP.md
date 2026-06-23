# Roadmap

**Status — v1 shipped.** Tier 1 + Tier 2 done, all ongoing filters shipped, and a product
pass (PWA, social preview, mobile). MONO° has **42 filters**, exports PNG/SVG/PDF/TXT/HTML,
shareable stacks, and is live at <https://obareau.github.io/mono/>.

---

# v1.x — planned (next)

Now that features are rich, the goal shifts from *more filters* to making the tool **pleasant
to use with 42 filters** and **hardening** it. Recommended order: A → B → C, with D ongoing.

## Lane A — workflow depth (do first)

- [ ] **Undo / redo.** History ring of serialized stack states; push on structural change and
      (debounced) on value change; `Ctrl/Cmd+Z` / `Shift+…+Z`.
- [ ] **User presets.** Save the current stack under a name → localStorage list; a "MY PRESETS"
      group in the left panel with delete; optional export/import of a preset file.
- [ ] **Filter browser search + favourites.** A filter box that filters the (now long) left
      list; star a filter → a Favourites group pinned at the top.
- [ ] **Randomize.** One click builds a sensible random stack (a base dither/screen, maybe a
      tone/colour prep, maybe one disruptor), seeded so it's shareable.
- [ ] **Canvas niceties.** Before/after toggle (hold to see source); wheel zoom + drag pan;
      a few keyboard shortcuts (open / export / undo / randomize).

## Lane B — performance (Web Worker)

- [ ] **Run the pipeline off the main thread.** Transfer the source planes to a worker once;
      on change, post the serialized stack + a request id and get back the gray buffer
      (transferable); debounce and drop stale results so the UI never freezes — important now
      that Engraving (LIC), Circle Pack and big stacks are heavy. ASCII/terminal render and
      `toVector` export can stay on the main thread (worker returns the buffer).
- [ ] This unblocks **Reaction-Diffusion** (heavy, iterative) and any future costly filter.

## Lane C — pro / print output

- [ ] **Export dialog.** Scale (1× / 2× / native / custom px), background (white / transparent),
      invert, format — instead of the current one-shot buttons.
- [ ] **Riso "ink" export.** The workbench stays strictly B&W, but on export map black → a
      chosen spot ink and white → a paper colour (e.g. orange on cream) for PNG/SVG — directly
      useful for zines / risograph.
- [ ] **Print-ready PDF.** Page size (A4 / Letter), DPI, margins, fit or tile.

## Lane D — new filters (ongoing)

- [ ] Clean Sobel edge detect (thinned) — distinct from XDoG / Contour Shock.
- [ ] More halftone variants (diamond / line-screen angles).
- [ ] Image-seeded Voronoi (seed density follows tone).
- [ ] Reaction-Diffusion, done properly (tuned dt, in the Lane-B worker).

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
