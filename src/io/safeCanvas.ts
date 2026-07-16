// The largest canvas a device actually renders is not a constant we can hard-code: iOS Safari
// caps total area (~16.7 M px, far less on old devices) while low-end Android GPUs cap any
// single dimension at GL_MAX_TEXTURE_SIZE (often 4096, sometimes 2048). Over the limit a canvas
// does NOT throw — it silently returns a blank (transparent) backing store, which is exactly how
// exports came back without effects. So we probe the real device limit once: draw a marker on a
// square canvas and read it back; if it's blank, the size was too big. Landscape/portrait images
// at a given long edge cover less area than the square of that edge, so a square that renders
// guarantees any image at that long edge renders too. Part of the "lychee hotfix".

const CANDIDATES = [4096, 3584, 3072, 2560, 2048, 1536, 1024];
let cached = 0; // largest proven-renderable square edge this session (0 = not yet probed)

// Does a square canvas of `edge` px actually render (not silently blank)?
function renders(edge: number): boolean {
  try {
    const c = document.createElement("canvas");
    c.width = edge;
    c.height = edge;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    ctx.fillStyle = "#000";
    ctx.fillRect(edge - 3, edge - 3, 3, 3); // opaque marker in the far corner
    const px = ctx.getImageData(edge - 1, edge - 1, 1, 1).data;
    return px[3] > 0 && px[0] < 128; // corner is opaque & black ⇒ the canvas really rendered
  } catch {
    return false;
  }
}

// Largest safe long edge this device can raster, capped at `cap`. Cached after the first probe.
export function maxRenderableEdge(cap = 4096): number {
  if (typeof document === "undefined") return cap; // no DOM (e.g. worker) — trust the caller's cap
  if (!cached) cached = CANDIDATES.find(renders) ?? 1024;
  return Math.min(cap, cached);
}
