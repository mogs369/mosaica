// sRGB (8-bit) -> CIE Lab (D65). Lab is used because distances in it roughly
// match how different two colours look to a person.

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const XN = 0.95047;
const ZN = 1.08883;

function f(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

/** Writes L, a, b into out[o..o+2]. */
export function rgbToLab(r: number, g: number, b: number, out: Float32Array | number[], o = 0): void {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / XN;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / ZN;
  const fx = f(x), fy = f(y), fz = f(z);
  out[o] = 116 * fy - 16;
  out[o + 1] = 500 * (fx - fy);
  out[o + 2] = 200 * (fy - fz);
}
