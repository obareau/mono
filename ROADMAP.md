# Roadmap

Ordered by leverage, not by how fun it is. The point of Tier 1 is to make MONO°
**usable and shareable** before deepening the engine.

## Tier 1 — ship soon, highest leverage

- [x] **Live deploy (GitHub Pages).** CI Action builds and publishes `dist/` on every push
      to main. Live at <https://obareau.github.io/mono/>, linked at the top of the README.
- [ ] **Full-resolution export.** Decouple the preview (downscaled to 1024px for speed)
      from export — re-run the stack at the source's native resolution for PNG. Required
      for print / zines / riso.
- [ ] **Stack presets (save / load / share).** Serialize the filter stack to JSON;
      persist in localStorage and encode into a shareable URL. Makes a composition
      reproducible and postable.

## Tier 2 — deepen the engine

- [ ] **Vector export (SVG / PDF)** for Halftone, Clustered Dot, Hatch, and stippling —
      crisp screens at any print size.
- [ ] **Performance: WebGL2 + Web Workers.** Port the per-pixel filters to fragment
      shaders (real-time at full res); move error diffusion and blue-noise generation to a
      worker. Unlocks smooth animated playback even with a deep stack.
- [ ] **Video export (WebM)** alongside GIF — lighter and smoother.

## Tier 3 — animated pipeline, deeper

- [ ] **Inter-frame feedback buffer** in the animated pipeline → re-enables the four
      disruptors that couldn't be ported as stills: Datamosh, Frame Hold, Sync Lost,
      Signal Loss.

## Ongoing — filters

- [ ] Voronoi tessellation (the natural step after the hex tiling)
- [ ] True Poisson-disk stippling
- [ ] Contour / topographic lines
- [ ] Custom **threshold-map** dithering (use any image as the dither mask)
- [ ] ASCII export to coloured HTML

## Parked — not planned

- **Live audio-reactive mode** (Web Audio / mic driving filter params). Considered as a
  bridge to [terminal-synth](https://github.com/obareau/terminal-synth) but deliberately
  dropped: not enough value for MONO°'s still/animated-render focus. The disruptors port
  already carries the shared visual language. Revisit only if a clear use case appears.
