import { FEAT_LEN, featDist, globalLowerBound } from './features';

// ---------------------------------------------------------------------------
// Colour index: buckets items by their overall Lab colour, so the nearest
// photos to a cell can be found without comparing against every photo.
// ---------------------------------------------------------------------------

const BIN = 6;
const L_MIN = -2, L_BINS = Math.ceil(104 / BIN);
const AB_MIN = -130, AB_BINS = Math.ceil(260 / BIN);

function clampBin(v: number, min: number, n: number): number {
  const i = Math.floor((v - min) / BIN);
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

export class ColorIndex {
  readonly start: Int32Array;
  readonly items: Int32Array;
  constructor(readonly feat: Float32Array, readonly n: number) {
    const nb = L_BINS * AB_BINS * AB_BINS;
    const count = new Int32Array(nb + 1);
    const binOf = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * FEAT_LEN;
      const b = this.bin(feat[o], feat[o + 1], feat[o + 2]);
      binOf[i] = b;
      count[b + 1]++;
    }
    for (let i = 0; i < nb; i++) count[i + 1] += count[i];
    this.start = count;
    this.items = new Int32Array(n);
    const fill = count.slice(0, nb);
    for (let i = 0; i < n; i++) this.items[fill[binOf[i]]++] = i;
  }
  private bin(L: number, a: number, b: number): number {
    return (clampBin(L, L_MIN, L_BINS) * AB_BINS + clampBin(a, AB_MIN, AB_BINS)) * AB_BINS + clampBin(b, AB_MIN, AB_BINS);
  }

  /**
   * Finds the k nearest items to the query feature. Writes indices and
   * distances (ascending) to outIdx/outCost at offset oo; returns the count.
   */
  nearest(q: Float32Array, qo: number, k: number, outIdx: Int32Array, outCost: Float32Array, oo: number): number {
    const feat = this.feat;
    k = Math.min(k, this.n);
    if (k === 0) return 0;
    let size = 0;
    const ci = clampBin(q[qo], L_MIN, L_BINS);
    const cj = clampBin(q[qo + 1], AB_MIN, AB_BINS);
    const ck = clampBin(q[qo + 2], AB_MIN, AB_BINS);
    const maxS = Math.max(ci, L_BINS - 1 - ci, cj, AB_BINS - 1 - cj, ck, AB_BINS - 1 - ck);
    let visited = 0;
    const visitBin = (i: number, j: number, kk: number) => {
      const b = (i * AB_BINS + j) * AB_BINS + kk;
      for (let p = this.start[b], e = this.start[b + 1]; p < e; p++) {
        const it = this.items[p];
        visited++;
        const d = featDist(q, qo, feat, it * FEAT_LEN);
        if (size === k && d >= outCost[oo + k - 1]) continue;
        let pos = size < k ? size++ : k - 1;
        while (pos > 0 && outCost[oo + pos - 1] > d) {
          outCost[oo + pos] = outCost[oo + pos - 1];
          outIdx[oo + pos] = outIdx[oo + pos - 1];
          pos--;
        }
        outCost[oo + pos] = d;
        outIdx[oo + pos] = it;
      }
    };
    for (let s = 0; s <= maxS; s++) {
      for (let i = ci - s; i <= ci + s; i++) {
        if (i < 0 || i >= L_BINS) continue;
        const di = Math.abs(i - ci);
        for (let j = cj - s; j <= cj + s; j++) {
          if (j < 0 || j >= AB_BINS) continue;
          const dj = Math.abs(j - cj);
          if (di === s || dj === s) {
            for (let kk = Math.max(0, ck - s); kk <= Math.min(AB_BINS - 1, ck + s); kk++) visitBin(i, j, kk);
          } else {
            if (ck - s >= 0) visitBin(i, j, ck - s);
            if (s > 0 && ck + s < AB_BINS) visitBin(i, j, ck + s);
          }
        }
      }
      if (visited >= this.n) break;
      // Anything not yet visited is at least s bins away in some channel.
      if (size === k && globalLowerBound(s * BIN) >= outCost[oo + k - 1]) break;
    }
    return size;
  }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

export interface MatchOptions {
  cols: number;
  rows: number;
  /** Use every photo at least once (if there are enough cells), spread evenly. */
  showEvery: boolean;
  /** Maximum times one photo may appear; 0 = no limit. */
  maxUses: number;
  /** The same photo is kept at least this many cells apart (0 = off). */
  spacing: number;
  seed?: number;
  /** Time budget for the improvement pass, in ms. */
  refineMs?: number;
}

export interface MatchResult {
  /** Tile index for each cell, row by row. */
  assign: Int32Array;
  /** Colour distance of each cell to its tile. */
  cost: Float32Array;
  distinct: number;
  meanCost: number;
  /** Repeat limit had to be raised because there were too few photos. */
  limitRaised: boolean;
  /** Cells that still have the same photo within the spacing distance. */
  spacingViolations: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CANDIDATES = 40;
const REPEAT_PENALTY = 30;

export function matchTiles(cellFeat: Float32Array, tileFeat: Float32Array, nTiles: number, opt: MatchOptions): MatchResult {
  const { cols, rows } = opt;
  const M = cols * rows;
  const N = nTiles;
  if (N === 0) throw new Error('No tile photos');
  const rand = mulberry32(opt.seed ?? 1);
  const R = Math.max(0, opt.spacing | 0);

  // Repeat limit
  let cap = opt.maxUses > 0 ? opt.maxUses : Infinity;
  if (opt.showEvery) cap = Math.min(cap, Math.ceil(M / N));
  let limitRaised = false;
  if (cap * N < M) {
    cap = Math.ceil(M / N);
    limitRaised = true;
  }
  // If the repeat rule could not be met, at least use every photo.
  const forceAll = (opt.showEvery || limitRaised) && N <= M;

  // Candidate photos for each cell
  const K = Math.min(N, CANDIDATES);
  const tileIndex = new ColorIndex(tileFeat, N);
  const cand = new Int32Array(M * K);
  const candCost = new Float32Array(M * K);
  const candN = new Int32Array(M);
  for (let c = 0; c < M; c++) candN[c] = tileIndex.nearest(cellFeat, c * FEAT_LEN, K, cand, candCost, c * K);

  const assign = new Int32Array(M).fill(-1);
  const cost = new Float32Array(M);
  const uses = new Int32Array(N);
  const cellsOf: number[][] = Array.from({ length: N }, () => []);
  const posInList = new Int32Array(M);

  const dist = (c: number, t: number) => featDist(cellFeat, c * FEAT_LEN, tileFeat, t * FEAT_LEN);

  /** Number of other cells within R holding tile t. */
  const neighbours = (c: number, t: number): number => {
    if (R === 0) return 0;
    const cx = c % cols, cy = (c / cols) | 0;
    let n = 0;
    for (let y = Math.max(0, cy - R); y <= Math.min(rows - 1, cy + R); y++) {
      for (let x = Math.max(0, cx - R); x <= Math.min(cols - 1, cx + R); x++) {
        const o = y * cols + x;
        if (o !== c && assign[o] === t) n++;
      }
    }
    return n;
  };

  const place = (c: number, t: number, d: number) => {
    const old = assign[c];
    if (old >= 0) {
      const list = cellsOf[old];
      const last = list.pop()!;
      if (last !== c) {
        list[posInList[c]] = last;
        posInList[last] = posInList[c];
      }
      uses[old]--;
    }
    assign[c] = t;
    cost[c] = d;
    if (t >= 0) {
      posInList[c] = cellsOf[t].length;
      cellsOf[t].push(c);
      uses[t]++;
    }
  };

  // Phase A: give every photo one cell, cheapest pairs first.
  if (forceAll) {
    const cellIndex = new ColorIndex(cellFeat, M);
    const K2 = Math.min(M, 24);
    const tc = new Int32Array(N * K2);
    const tcc = new Float32Array(N * K2);
    const pairs: number[] = [];
    for (let t = 0; t < N; t++) {
      const n = cellIndex.nearest(tileFeat, t * FEAT_LEN, K2, tc, tcc, t * K2);
      for (let i = 0; i < n; i++) pairs.push(t * K2 + i);
    }
    pairs.sort((x, y) => tcc[x] - tcc[y]);
    for (const p of pairs) {
      const t = (p / K2) | 0;
      const c = tc[p];
      if (uses[t] === 0 && assign[c] < 0) place(c, t, tcc[p]);
    }
    for (let t = 0; t < N; t++) {
      if (uses[t] > 0) continue;
      let best = -1, bd = Infinity;
      for (let c = 0; c < M; c++) {
        if (assign[c] >= 0) continue;
        const d = dist(c, t);
        if (d < bd) { bd = d; best = c; }
      }
      if (best >= 0) place(best, t, bd);
    }
  }

  // Phase B: fill the remaining cells with their best allowed photo.
  const order: number[] = [];
  for (let c = 0; c < M; c++) if (assign[c] < 0) order.push(c);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const c of order) {
    let chosen = -1, cd = Infinity;
    const base = c * K;
    for (let i = 0; i < candN[c]; i++) {
      const t = cand[base + i];
      if (uses[t] < cap && neighbours(c, t) === 0) { chosen = t; cd = candCost[base + i]; break; }
    }
    if (chosen < 0) {
      // Candidates are used up: look through every photo.
      let fallback = -1, fd = Infinity;
      for (let t = 0; t < N; t++) {
        if (uses[t] >= cap) continue;
        const d = dist(c, t);
        if (neighbours(c, t) === 0) {
          if (d < cd) { cd = d; chosen = t; }
        } else if (d < fd) { fd = d; fallback = t; }
      }
      if (chosen < 0) { chosen = fallback; cd = fd; }
    }
    if (chosen < 0) { chosen = cand[base]; cd = candCost[base]; }
    place(c, chosen, cd);
  }

  // Phase C: improve with local moves (swap two cells' photos, or replace one).
  const change = (c: number, t: number): number => {
    const old = assign[c];
    const d = dist(c, t);
    const delta = d - cost[c] + REPEAT_PENALTY * (neighbours(c, t) - neighbours(c, old));
    place(c, t, d);
    return delta;
  };
  const budget = opt.refineMs ?? 2000;
  const t0 = performance.now();
  const maxIter = 80 * M;
  for (let it = 0; it < maxIter; it++) {
    if ((it & 1023) === 0 && performance.now() - t0 > budget) break;
    const c = Math.floor(rand() * M);
    const t = assign[c];
    const n = candN[c];
    const r = rand();
    const t2 = cand[c * K + Math.floor(r * r * n)];
    if (t2 === t) continue;
    const canReplace = uses[t2] < cap && !(forceAll && uses[t] === 1);
    if (canReplace && rand() < 0.5) {
      const d = change(c, t2);
      if (d >= -1e-6) change(c, t);
    } else if (uses[t2] > 0) {
      const list = cellsOf[t2];
      const c2 = list[Math.floor(rand() * list.length)];
      const d1 = change(c, t2);
      const d2 = change(c2, t);
      if (d1 + d2 >= -1e-6) {
        change(c2, t2);
        change(c, t);
      }
    } else if (canReplace) {
      const d = change(c, t2);
      if (d >= -1e-6) change(c, t);
    }
  }

  let distinct = 0;
  for (let t = 0; t < N; t++) if (uses[t] > 0) distinct++;
  let sum = 0, violations = 0;
  for (let c = 0; c < M; c++) {
    sum += cost[c];
    if (neighbours(c, assign[c]) > 0) violations++;
  }
  return { assign, cost, distinct, meanCost: sum / M, limitRaised, spacingViolations: violations };
}
