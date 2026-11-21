import { describe, expect, it } from 'vitest';
import { rgbToLab } from '../src/core/color';
import { computeFeature, FEAT_LEN, SAMPLE, featDist } from '../src/core/features';
import { ColorIndex, matchTiles, mulberry32 } from '../src/core/match';

function flat(r: number, g: number, b: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(SAMPLE * SAMPLE * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
  return d;
}
function splitTopBottom(top: number, bottom: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(SAMPLE * SAMPLE * 4);
  for (let y = 0; y < SAMPLE; y++) for (let x = 0; x < SAMPLE; x++) {
    const v = y < SAMPLE / 2 ? top : bottom, p = (y * SAMPLE + x) * 4;
    d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255;
  }
  return d;
}
function feat(d: Uint8ClampedArray): Float32Array {
  const f = new Float32Array(FEAT_LEN);
  computeFeature(d, SAMPLE, 0, 0, f, 0);
  return f;
}
function concat(fs: Float32Array[]): Float32Array {
  const out = new Float32Array(fs.length * FEAT_LEN);
  fs.forEach((f, i) => out.set(f, i * FEAT_LEN));
  return out;
}

describe('colour', () => {
  it('converts reference colours to Lab', () => {
    const o = [0, 0, 0];
    rgbToLab(255, 255, 255, o); expect(o[0]).toBeCloseTo(100, 0); expect(Math.abs(o[1])).toBeLessThan(0.5);
    rgbToLab(0, 0, 0, o); expect(o[0]).toBeCloseTo(0, 1);
    rgbToLab(255, 0, 0, o); expect(o[0]).toBeCloseTo(53.2, 0); expect(o[1]).toBeCloseTo(80.1, 0); expect(o[2]).toBeCloseTo(67.2, 0);
  });
});

describe('features', () => {
  it('distinguishes layout, not just average', () => {
    const tb = feat(splitTopBottom(0, 255)), bt = feat(splitTopBottom(255, 0));
    const grey = feat(flat(119, 119, 119));
    expect(featDist(tb, 0, tb, 0)).toBe(0);
    expect(featDist(tb, 0, bt, 0)).toBeGreaterThan(featDist(tb, 0, grey, 0));
  });
});

describe('ColorIndex', () => {
  it('returns the same nearest photos as brute force', () => {
    const rnd = mulberry32(7);
    const N = 500;
    const tiles = concat(Array.from({ length: N }, () => feat(flat(rnd() * 255, rnd() * 255, rnd() * 255))));
    const idx = new ColorIndex(tiles, N);
    const outI = new Int32Array(10), outC = new Float32Array(10);
    for (let q = 0; q < 30; q++) {
      const f = feat(flat(rnd() * 255, rnd() * 255, rnd() * 255));
      idx.nearest(f, 0, 10, outI, outC, 0);
      const brute = Array.from({ length: N }, (_, i) => featDist(f, 0, tiles, i * FEAT_LEN)).sort((a, b) => a - b).slice(0, 10);
      brute.forEach((d, i) => expect(outC[i]).toBeCloseTo(d, 4));
    }
  });
});

describe('matchTiles', () => {
  const rnd = mulberry32(3);
  const palette = Array.from({ length: 60 }, () => [rnd() * 255, rnd() * 255, rnd() * 255].map(Math.round));
  const tiles = concat(palette.map(([r, g, b]) => feat(flat(r, g, b))));
  const cols = 20, rows = 15, M = cols * rows;
  const cells = concat(Array.from({ length: M }, (_, i) => {
    const [r, g, b] = palette[(i * 7) % palette.length];
    return feat(flat(Math.min(255, r + 3), g, b));
  }));

  it('picks the exact colour when allowed to repeat freely', () => {
    const res = matchTiles(cells, tiles, palette.length, { cols, rows, showEvery: false, maxUses: 0, spacing: 0 });
    for (let c = 0; c < M; c++) expect(res.assign[c]).toBe((c * 7) % palette.length);
    expect(res.meanCost).toBeLessThan(3);
  });

  it('uses every photo, evenly, when asked', () => {
    // Only 20 colours appear in the cells, but there are 60 photos.
    const cells2 = concat(Array.from({ length: M }, (_, i) => feat(flat(...(palette[i % 20] as [number, number, number])))));
    const res = matchTiles(cells2, tiles, palette.length, { cols, rows, showEvery: true, maxUses: 0, spacing: 0 });
    const uses = new Array(palette.length).fill(0);
    res.assign.forEach((t) => uses[t]++);
    expect(Math.min(...uses)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...uses)).toBeLessThanOrEqual(Math.ceil(M / palette.length));
    expect(res.distinct).toBe(palette.length);
  });

  it('respects the repeat limit and spacing', () => {
    const res = matchTiles(cells, tiles, palette.length, { cols, rows, showEvery: false, maxUses: 6, spacing: 2 });
    const uses = new Array(palette.length).fill(0);
    res.assign.forEach((t) => uses[t]++);
    expect(Math.max(...uses)).toBeLessThanOrEqual(6);
    expect(res.spacingViolations).toBe(0);
  });

  it('never repeats when there are more photos than cells', () => {
    const res = matchTiles(cells.subarray(0, 50 * FEAT_LEN), tiles, palette.length, { cols: 10, rows: 5, showEvery: true, maxUses: 0, spacing: 0 });
    expect(new Set(res.assign).size).toBe(50);
  });

  it('uses every photo when "never repeat" is impossible', () => {
    const res = matchTiles(cells, tiles, palette.length, { cols, rows, showEvery: false, maxUses: 1, spacing: 1 });
    expect(res.limitRaised).toBe(true);
    expect(res.distinct).toBe(palette.length);
  });

  it('is deterministic for a seed', () => {
    const o = { cols, rows, showEvery: true, maxUses: 0, spacing: 2, seed: 5, refineMs: 1e9 };
    const a = matchTiles(cells, tiles, palette.length, o).assign;
    const b = matchTiles(cells, tiles, palette.length, o).assign;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

import { computeLayout, PRESETS } from '../src/core/layout';
describe('layout', () => {
  it('never prints larger than the paper and keeps square tiles', () => {
    for (const p of PRESETS.filter((x) => x.inches)) for (const across of [8, 20, 32, 57, 120]) for (const [w, h] of [[3024, 4032], [4032, 3024], [1000, 1000]]) {
      const l = computeLayout(w, h, p, across);
      const [s, lg] = p.inches!;
      const [pw, ph] = h >= w ? [s, lg] : [lg, s];
      expect(l.outW).toBeLessThanOrEqual(Math.round(pw * 300));
      expect(l.outH).toBeLessThanOrEqual(Math.round(ph * 300));
      expect(l.outW).toBe(l.cols * l.cell);
      expect(l.outH).toBe(l.rows * l.cell);
      expect(l.crop.sw / l.crop.sh).toBeCloseTo(l.outW / l.outH, 3);
    }
  });
});
