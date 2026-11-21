import { it } from 'vitest';
import { FEAT_LEN } from '../src/core/features';
import { matchTiles, mulberry32 } from '../src/core/match';

// Synthetic "photo-like" features: smooth random colours with some layout.
function make(n: number, seed: number): Float32Array {
  const r = mulberry32(seed);
  const f = new Float32Array(n * FEAT_LEN);
  for (let i = 0; i < n; i++) {
    const L = r() * 90 + 5, a = (r() - 0.5) * 60, b = (r() - 0.5) * 80;
    let sL = 0, sa = 0, sb = 0;
    for (let k = 0; k < 16; k++) {
      const o = i * FEAT_LEN + 3 + k * 3;
      f[o] = Math.max(0, Math.min(100, L + (r() - 0.5) * 30)); f[o + 1] = a + (r() - 0.5) * 10; f[o + 2] = b + (r() - 0.5) * 10;
      sL += f[o]; sa += f[o + 1]; sb += f[o + 2];
    }
    f[i * FEAT_LEN] = sL / 16; f[i * FEAT_LEN + 1] = sa / 16; f[i * FEAT_LEN + 2] = sb / 16;
  }
  return f;
}

const cases: [string, number, number, number, boolean][] = [
  ['NZ-like folder: 32x42 cells, 1,300 photos, show every', 32, 42, 1300, true],
  ['Big folder: 32x42 cells, 20,000 photos', 32, 42, 20000, false],
  ['Whole library: 32x42 cells, 200,000 photos', 32, 42, 200000, false],
  ['Dense: 100x129 cells, 5,000 photos, show every', 100, 129, 5000, true],
];
for (const [name, cols, rows, n, every] of cases) {
  it.runIf(process.env.BENCH)(name, () => {
    const cells = make(cols * rows, 1), tiles = make(n, 2);
    const t0 = performance.now();
    const res = matchTiles(cells, tiles, n, { cols, rows, showEvery: every, maxUses: 0, spacing: 2, refineMs: 2000 });
    console.log(`${name}: ${(performance.now() - t0).toFixed(0)} ms, distinct ${res.distinct}, mean ${res.meanCost.toFixed(1)}, spacing violations ${res.spacingViolations}`);
  }, 120000);
}
