// Decode an image file into a grayscale Float32Array (Rec. 601 luma), downscaled so the
// long edge fits `maxDim` — keeps live processing responsive. Returns buffer + dimensions.
export async function loadImageFile(file, maxDim = 1024) {
    const bitmap = await createImageBitmap(file);
    return fromBitmap(bitmap, maxDim);
}
export function fromBitmap(bitmap, maxDim) {
    const iw = "width" in bitmap ? bitmap.width : 0;
    const ih = "height" in bitmap ? bitmap.height : 0;
    const scale = Math.min(1, maxDim / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        // Rec. 601 luma, normalized to 0..1
        gray[j] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    }
    return { gray, w, h };
}
