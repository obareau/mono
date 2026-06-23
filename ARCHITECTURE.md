# Architecture

## One pipeline

Everything is a single chain:

```
source image ──► grayscale buffer ──► [ filter · filter · filter … ] ──► output
```

- **Source**: decoded once into separate R/G/B planes **and** a default luma `gray`, plus the
  original `ImageBitmap` (kept for full-resolution export). All downscaled so the long edge ≤
  1024px for a responsive live preview.
- **Grayscale buffer**: a `Float32Array` of length `w*h`, each value in `[0,1]` (`0` = black,
  `1` = white). This is the currency every filter speaks.
- Tonal / screen / dither filters **transform** the buffer; dithering filters **collapse** it
  to exactly `0` or `1`.
- Each stack item has an **opacity (Mix)**: when `< 1`, the pipeline blends the filter's
  result back toward its input.

## What a filter can be

A `Filter` is data + up to four optional capabilities (see `filters/types.ts`):

| Capability | Signature | Used by | Output |
|------------|-----------|---------|--------|
| **`apply`** | `(gray, w, h, params) → gray` | most filters | transformed grayscale buffer |
| **`fromRGB`** | `(r, g, b, w, h, params) → gray` | Color Filter | (re)derives gray from the source RGB — photographic B&W filters |
| **`render`** | `(gray, w, h, params) → TerminalRender` | ASCII | draws its own canvas; also `text()` / `html()` for `.txt` / `.html` export |
| **`toVector`** | `(gray, w, h, params) → VectorScene` | Halftone, Clustered Dot, Concentric, Stipple, Circle Pack, Hatch | resolution-independent primitives for SVG / PDF |

The two computational families still matter: **per-pixel** filters (threshold, screens,
geometry, warps) are independent per output pixel, while **sequential** error-diffusion
(Floyd-Steinberg, Atkinson, Ostromoukhov, Riemersma…) feeds each pixel's quantization error
into *unprocessed* neighbours and so must run in scan order. The latter is the reason the
engine is intentionally CPU, not GPU (see below).

## Modules

```
src/
  filters/
    types.ts        Filter interface, ParamDef (drives the UI), Gray / VecPrim / VectorScene
    registry.ts     single source of truth — list a filter here, it appears in the UI
    *.ts            ~42 filters grouped by category: color, tone, signal, dither,
                    screen, geometry, disrupt, offset, ascii
                    (some export arrays: signalFx, geometry, disruptors)
  engine/
    pipeline.ts     runPipeline (stack → result), runToVector (stack → SVG/PDF scene),
                    per-item opacity blend, terminal short-circuit
  io/
    loadImage.ts    decode → R/G/B + luma + kept bitmap, downscaled
    render.ts       buffer → 1-bit canvas; terminal → its own draw; PNG export
    vector.ts       VectorScene → SVG and dependency-free PDF (circles as Béziers)
    presets.ts      stack ⇄ compact JSON; URL #s= hash + localStorage; starter presets
    maskStore.ts    in-memory dither masks for the Threshold Map filter
    demo.ts         first-load demo image (bundled splash, procedural fallback)
  state/
    store.ts        observable store; structural vs value notifications so slider drags
                    don't rebuild the sidebar
  ui/
    app.ts          three-panel layout, file/drag/paste I/O, exports, render
    controls.ts     builds a control row from a ParamDef (incl. a "mask" loader) — no
                    per-filter UI code
  main.ts           bootstrap: restore stack (URL → localStorage → default), load demo
```

## Data-driven UI

A filter declares its parameters; `controls.ts` reads them and emits the right
slider / toggle / select / text / mask control. Adding a filter is: write the transform,
declare its `params`, register it — **zero UI wiring**. The interface is a three-panel
Lightroom layout (filter browser left, canvas centre, stack right) with drag-to-reorder and
a per-filter Mix slider.

## Output paths

- **PNG** — re-runs the whole stack at the source's **native** resolution (from the kept
  bitmap, capped 4096), so the preview stays fast but exports stay sharp.
- **SVG / PDF** — `runToVector` runs the stack up to the last vector-capable filter, then
  serializes its primitives (dependency-free writers).
- **TXT / HTML** — the ASCII terminal's `text()` / `html()`.
- **Share** — the filter stack (with params + opacity) is encoded into a `#s=` URL hash;
  it also autosaves to localStorage.

## Why CPU, not GPU

Operating on a downscaled `Float32Array` keeps every filter exact and trivially debuggable,
and sequential error-diffusion *cannot* be a shader anyway. The CPU pipeline is fast enough
(1024px live preview, native-res export on demand), so a WebGL2 rewrite of ~42 working filters
isn't worth it. If a deep stack ever feels heavy, the move is to push the pipeline into a Web
Worker — not the GPU. The `Filter` contract wouldn't change either way.

## Build & delivery

Vite + TypeScript, **zero runtime dependencies** (~20 kB gzip). `vite-plugin-pwa` (build-time)
adds an offline service worker + web manifest, so MONO° is an installable PWA. A GitHub Actions
workflow builds and deploys to GitHub Pages on every push to `main`.
