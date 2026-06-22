# Architecture

## One pipeline

Everything is a single chain:

```
source image ──► grayscale buffer ──► [ filter · filter · filter … ] ──► output
```

- **Grayscale buffer**: a `Float32Array` of length `w*h`, each value in `[0,1]`
  (`0` = black, `1` = white). This is the only currency the filters speak.
- Tonal/screen/dither filters **transform** the buffer.
- Dithering filters **collapse** it to exactly `0` or `1`.
- A **terminal** filter (ASCII) doesn't emit pixels — it renders its own representation
  and ends the chain.

## Three families of filters

This split is the central design decision. The three kinds compute very differently:

| Kind | Examples | Nature | Where it runs today | Future |
|------|----------|--------|---------------------|--------|
| **Per-pixel** | Threshold, Bayer, Halftone, Offset, Tone | each output pixel independent | CPU buffer pass | trivially portable to a WebGL2 fragment shader |
| **Sequential** | Floyd-Steinberg, Atkinson | each pixel's error feeds *unprocessed* neighbours | CPU, in scan order | stays CPU (a Web Worker) — **cannot** be a GPU shader |
| **Terminal** | ASCII | produces glyphs/vectors, not a bitmap | own `draw()` | SVG/PDF emit path |

Mislabelling error-diffusion as GPU-able is the classic trap; it's explicit here.

## Modules

```
src/
  filters/
    types.ts          Filter interface + declarative ParamDef (drives the UI)
    registry.ts       single source of truth — list a filter here, it appears in the UI
    tone.ts           brightness / contrast / gamma / invert
    threshold.ts      hard 1-bit cut
    floydSteinberg.ts error diffusion (Floyd-Steinberg + Atkinson), serpentine
    bayer.ts          ordered dithering, recursive Bayer matrix
    halftone.ts       rotated dot/square/line screen
    offset.ts         echo misregistration + sliced scan-shift
    ascii.ts          terminal: glyph grid from a user-supplied ramp string
  engine/
    pipeline.ts       runs the stack top-to-bottom; stops at a terminal filter
  io/
    loadImage.ts      decode → luma → downscaled Float32Array
    render.ts         buffer → 1-bit canvas; terminal → its own draw; PNG export
  state/
    store.ts          observable store (source + filter stack); mutation → re-render
  ui/
    app.ts            layout, file I/O (open/drop/paste), render loop
    controls.ts       builds a control row from a ParamDef — zero per-filter UI code
  main.ts             bootstrap + seed default stack
```

## Data-driven UI

A filter declares its parameters:

```ts
params: [
  { key: "level", label: "Level", type: "range", default: 0.5, min: 0, max: 1, step: 0.01 },
  { key: "kernel", label: "Kernel", type: "select", default: "Floyd-Steinberg",
    options: ["Floyd-Steinberg", "Atkinson"] },
]
```

`controls.ts` reads that and emits the right slider / toggle / select / text input. So the
path to "150 filters" is: write the transform, declare its params, register it. No UI wiring.

## Why CPU now, GPU later

Operating on a downscaled `Float32Array` (long edge ≤ 1024px) keeps every filter trivially
debuggable and exact, and the per-pixel ones already match a shader's math 1:1. When real-time
full-resolution is needed, the per-pixel family lifts into WebGL2 fragment shaders behind the
same `Filter` interface; the sequential family moves into a Web Worker. The pipeline contract
doesn't change.
```
