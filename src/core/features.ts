import { rgbToLab } from './color';

/**
 * A photo (or a cell of the main photo) is described by its average Lab colour
 * plus the average Lab colour of each square in a GRID x GRID layout. The layout
 * part lets a tile that is dark on top and light below land where the main photo
 * has the same shape, not just the same average colour.
 */
export const GRID = 4;
/** Side, in pixels, of the square a feature is computed from. */
export const SAMPLE = 32;
export const FEAT_LEN = 3 + 3 * GRID * GRID;

const W_GLOBAL = 0.5;
const W_LAYOUT = 0.5 / (GRID * GRID);

const lab = new Float32Array(3);

/**
 * Computes the feature of the SAMPLE x SAMPLE square at (x0, y0) in an RGBA
 * buffer of the given width. Writes FEAT_LEN numbers to out[o..] and the mean
 * sRGB colour to rgbOut[ro..ro+2] when given.
 */
export function computeFeature(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  x0: number,
  y0: number,
  out: Float32Array,
  o = 0,
  rgbOut?: Float32Array | Uint8Array | number[],
  ro = 0,
): void {
  const block = SAMPLE / GRID;
  const perBlock = block * block;
  for (let i = 0; i < FEAT_LEN; i++) out[o + i] = 0;
  let sr = 0, sg = 0, sb = 0;
  for (let y = 0; y < SAMPLE; y++) {
    const by = (y / block) | 0;
    let p = ((y0 + y) * width + x0) * 4;
    for (let x = 0; x < SAMPLE; x++, p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2];
      sr += r; sg += g; sb += b;
      rgbToLab(r, g, b, lab, 0);
      const k = o + 3 + 3 * (by * GRID + ((x / block) | 0));
      out[k] += lab[0];
      out[k + 1] += lab[1];
      out[k + 2] += lab[2];
    }
  }
  for (let i = 0; i < GRID * GRID; i++) {
    const k = o + 3 + 3 * i;
    out[k] /= perBlock;
    out[k + 1] /= perBlock;
    out[k + 2] /= perBlock;
    out[o] += out[k];
    out[o + 1] += out[k + 1];
    out[o + 2] += out[k + 2];
  }
  out[o] /= GRID * GRID;
  out[o + 1] /= GRID * GRID;
  out[o + 2] /= GRID * GRID;
  if (rgbOut) {
    const n = SAMPLE * SAMPLE;
    rgbOut[ro] = sr / n;
    rgbOut[ro + 1] = sg / n;
    rgbOut[ro + 2] = sb / n;
  }
}

/**
 * Distance between two features, in Lab units (about 2.3 is a just-noticeable
 * difference). Half the weight is the overall colour, half the layout.
 */
export function featDist(a: Float32Array, ao: number, b: Float32Array, bo: number): number {
  const d0 = a[ao] - b[bo], d1 = a[ao + 1] - b[bo + 1], d2 = a[ao + 2] - b[bo + 2];
  let s = 0;
  for (let i = 3; i < FEAT_LEN; i++) {
    const d = a[ao + i] - b[bo + i];
    s += d * d;
  }
  return Math.sqrt(W_GLOBAL * (d0 * d0 + d1 * d1 + d2 * d2) + W_LAYOUT * s);
}

/**
 * The overall colour is the mean of the layout squares, so the layout part is at
 * least as large as the overall part. featDist is therefore never smaller than
 * the plain Lab distance between the two overall colours.
 */
export function globalLowerBound(globalDist: number): number {
  return globalDist;
}
