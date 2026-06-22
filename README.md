# MONO°

**An industrial 1-bit black & white image workbench.** Drop in a photo, stack screens and
dithers, and pull out crisp monochrome art. Built for zines, risograph/offset prep, and the
pure MacPaint aesthetic.

Black & white only, by design. The interface is grayscale with a single restrained orange accent.

![status](https://img.shields.io/badge/status-alpha-ff5a00)

## Filters

| Filter | What it does |
|--------|--------------|
| **Color Filter** | B&W photographic filters (red/orange/yellow/green/blue) — re-derives gray from source RGB, like coloured glass on the lens |
| **Tone** | Brightness / contrast / gamma / invert — prep before screening |
| **Threshold** | Hard 1-bit cut |
| **Error Diffusion** | Floyd-Steinberg, Atkinson, Jarvis-Judice-Ninke, Stucki, Burkes, Sierra, Sierra Lite, Stevenson-Arce — serpentine scan |
| **Ostromoukhov** | Variable-coefficient error diffusion (SIGGRAPH 2001) — near blue-noise, artefact-free |
| **Riemersma** | Error diffusion along a Hilbert curve — isotropic, scanline-free grain |
| **Ordered (Bayer)** | 2/4/8 matrix screens — the structured paint-program look |
| **Blue Noise** | Void-and-cluster FM screen — fine organic grain, no pattern |
| **Patterns** | MacPaint-style 8×8 fill tiles, tone-mapped or single-tile |
| **Halftone** | Rotated dot / square / line screen — offset print "trame" |
| **Clustered Dot** | AM halftone screen locked to the pixel grid — growing press dots |
| **Hatch** | Lines / crosshatch / spiral screens, tone-driven thickness |
| **Offset** | Misregistration ghosting + sliced scan-shift glitch |
| **ASCII** | Text-mode rendering — **type the character ramp yourself**, export `.txt` |

Filters apply **top to bottom** as a stack: reorder, toggle, and tweak each one live.
Adding a new filter is one file + one registry line — controls are generated from the
filter's declared parameters.

## Run it

```bash
npm install
npm run dev
```

Then drop, paste, or open an image.

- **Export** writes a 1:1 PNG.
- ASCII is a *terminal* filter: it renders its own glyph grid and ends the buffer chain.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md). In short: `source image → grayscale buffer →
[filter stack] → output`. Filters are pure transforms on a `Float32Array` (values 0..1);
error-diffusion is intentionally CPU/sequential, screens are per-pixel and GPU-ready for later.

## Roadmap

- [ ] GPU (WebGL2) path for per-pixel screens — real-time at full res
- [ ] SVG / PDF vector export for halftone & stipple
- [ ] Interactive filters (pointer + device tilt)
- [ ] More dither kernels (Stucki, Sierra, Burkes) and classic Mac pattern fills
- [ ] Filter-stack presets

## License

MIT
