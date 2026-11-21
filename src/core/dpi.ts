// Write a print resolution into exported files so they open at the right size
// in print dialogs (JPEG JFIF density / PNG pHYs chunk).

export function setJpegDpi(buf: Uint8Array<ArrayBuffer>, dpi: number): Uint8Array<ArrayBuffer> {
  // SOI (FFD8) then APP0 "JFIF\0"
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff && buf[3] === 0xe0 &&
      buf[6] === 0x4a && buf[7] === 0x46 && buf[8] === 0x49 && buf[9] === 0x46 && buf[10] === 0) {
    const out = buf.slice();
    out[13] = 1; // units: dots per inch
    out[14] = dpi >> 8; out[15] = dpi & 0xff;
    out[16] = dpi >> 8; out[17] = dpi & 0xff;
    return out;
  }
  // No JFIF header: insert one after SOI.
  const app0 = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, dpi >> 8, dpi & 0xff, dpi >> 8, dpi & 0xff, 0, 0]);
  const out = new Uint8Array(buf.length + app0.length);
  out.set(buf.subarray(0, 2), 0);
  out.set(app0, 2);
  out.set(buf.subarray(2), 2 + app0.length);
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function setPngDpi(buf: Uint8Array<ArrayBuffer>, dpi: number): Uint8Array<ArrayBuffer> {
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  // Insert right after IHDR (8-byte signature + 25-byte IHDR chunk).
  const at = 8 + 25;
  const out = new Uint8Array(buf.length + chunk.length);
  out.set(buf.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(buf.subarray(at), at + chunk.length);
  return out;
}
