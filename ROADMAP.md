# Roadmap

Ordered by leverage, not by how fun it is. The point of Tier 1 is to make MONO°
**usable and shareable** before deepening the engine.

## Tier 1 — ship soon, highest leverage

- [x] **Live deploy (GitHub Pages).** CI Action builds and publishes `dist/` on every push
      to main. Live at <https://obareau.github.io/mono/>, linked at the top of the README.
- [x] **Full-resolution export.** Preview stays at 1024px; EXPORT PNG re-runs the stack at
      the source's native resolution (capped at 4096) from the kept original bitmap.
- [x] **Stack presets (save / load / share).** Stack autosaves to localStorage and can be
      shared via a `#s=` URL hash (COPY LINK button); shared links restore on load.

## Tier 2 — print-grade output

- [ ] **Vector export (SVG / PDF)** for Halftone, Clustered Dot, Hatch, and stippling —
      crisp screens at any print size. The headline Tier 2 feature.

## Ongoing — filters

- [ ] Voronoi tessellation (the natural step after the hex tiling)
- [ ] True Poisson-disk stippling
- [ ] Contour / topographic lines
- [ ] Custom **threshold-map** dithering (use any image as the dither mask)
- [ ] ASCII export to coloured HTML

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
