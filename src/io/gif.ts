// Minimal GIF89a animated encoder (no dependencies). Frames are palette-index buffers;
// MONO° uses a 256-entry grayscale palette, which 1-bit/low-grey output compresses very well.

// LSB-first bit writer for the LZW code stream.
class BitWriter {
  bytes: number[] = [];
  private acc = 0;
  private nbits = 0;
  write(code: number, size: number) {
    this.acc |= code << this.nbits;
    this.nbits += size;
    while (this.nbits >= 8) {
      this.bytes.push(this.acc & 0xff);
      this.acc >>= 8;
      this.nbits -= 8;
    }
  }
  flush() {
    if (this.nbits > 0) {
      this.bytes.push(this.acc & 0xff);
      this.acc = 0;
      this.nbits = 0;
    }
  }
}

// GIF-variant LZW compression of one frame's indices.
function lzwEncode(minCodeSize: number, indices: Uint8Array): number[] {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  const bw = new BitWriter();
  let dict = new Map<number, number>();
  let codeSize = minCodeSize + 1;
  let counter = eoi + 1;
  const reset = () => {
    dict = new Map();
    codeSize = minCodeSize + 1;
    counter = eoi + 1;
  };

  bw.write(clear, codeSize);
  let cur = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (cur << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      cur = found;
    } else {
      bw.write(cur, codeSize);
      dict.set(key, counter);
      counter++;
      if (counter === 4096) {
        bw.write(clear, codeSize);
        reset();
      } else if (counter === 1 << codeSize && codeSize < 12) {
        codeSize++;
      }
      cur = k;
    }
  }
  bw.write(cur, codeSize);
  bw.write(eoi, codeSize);
  bw.flush();
  return bw.bytes;
}

export interface GifFrame {
  indices: Uint8Array; // length w*h, values 0..255 into the palette
  delayCs: number; // frame delay in centiseconds (1/100 s)
}

export function encodeGIF(frames: GifFrame[], w: number, h: number, palette?: number[]): Blob {
  // default palette: 256 levels of grey
  const pal = palette ?? defaultGrayPalette();
  const out: number[] = [];
  const push = (...b: number[]) => out.push(...b);
  const word = (n: number) => push(n & 0xff, (n >> 8) & 0xff);

  // header + logical screen descriptor (global color table, 256 entries)
  for (const c of "GIF89a") push(c.charCodeAt(0));
  word(w);
  word(h);
  push(0xf7, 0, 0); // packed: GCT present, 256 colors; bg=0; aspect=0
  for (let i = 0; i < 256; i++) push(pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2]);

  // Netscape loop extension (loop forever)
  push(0x21, 0xff, 0x0b);
  for (const c of "NETSCAPE2.0") push(c.charCodeAt(0));
  push(0x03, 0x01, 0x00, 0x00, 0x00);

  for (const frame of frames) {
    // graphic control extension (delay)
    push(0x21, 0xf9, 0x04, 0x00);
    word(frame.delayCs);
    push(0x00, 0x00);
    // image descriptor
    push(0x2c);
    word(0);
    word(0);
    word(w);
    word(h);
    push(0x00);
    // LZW data
    const minCodeSize = 8;
    push(minCodeSize);
    const data = lzwEncode(minCodeSize, frame.indices);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      push(chunk.length, ...chunk);
    }
    push(0x00); // block terminator
  }

  push(0x3b); // trailer
  return new Blob([new Uint8Array(out)], { type: "image/gif" });
}

function defaultGrayPalette(): number[] {
  const p = new Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    p[i * 3] = p[i * 3 + 1] = p[i * 3 + 2] = i;
  }
  return p;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
