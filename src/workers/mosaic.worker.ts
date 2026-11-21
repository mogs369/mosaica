/// <reference lib="webworker" />
// Builds the mosaic: describes the main photo cell by cell, places tiles,
// and draws the result at preview or print size.

import { decodeImage } from '../core/decode';
import { computeFeature, FEAT_LEN, SAMPLE } from '../core/features';
import { type Layout } from '../core/layout';
import { matchTiles, type MatchOptions } from '../core/match';
import { getThumb, getTiles } from '../db';

export type MosaicRequest =
  | { type: 'main'; file: Blob; name: string }
  | { type: 'match'; layout: Layout; folderIds: string[]; options: Omit<MatchOptions, 'cols' | 'rows'> }
  | { type: 'render'; scale: number; blend: number; tint: number; format?: 'jpeg' | 'png' | 'bitmap' };

export type MosaicReply =
  | { type: 'main'; width: number; height: number; preview: ImageBitmap }
  | { type: 'match'; distinct: number; total: number; meanCost: number; limitRaised: boolean; spacingViolations: number; ms: number }
  | { type: 'render'; bitmap?: ImageBitmap; blob?: Blob; width: number; height: number }
  | { type: 'progress'; stage: string; done: number; total: number }
  | { type: 'error'; message: string };

let main: ImageBitmap | null = null;
let plan: {
  layout: Layout;
  keys: string[];
  rgb: Float32Array; // per tile
  assign: Int32Array;
  cellRgb: Float32Array; // per cell
} | null = null;

const post = (m: MosaicReply, transfer: Transferable[] = []) => postMessage(m, transfer);

async function setMain(file: Blob, name: string) {
  main?.close();
  main = await decodeImage(file, name);
  plan = null;
  const k = Math.min(1, 480 / Math.max(main.width, main.height));
  const preview = await createImageBitmap(main, { resizeWidth: Math.round(main.width * k), resizeHeight: Math.round(main.height * k), resizeQuality: 'high' });
  post({ type: 'main', width: main.width, height: main.height, preview }, [preview]);
}

/** Feature + mean colour of every cell of the main photo. */
function describeCells(layout: Layout): { feat: Float32Array; rgb: Float32Array } {
  const { cols, rows, crop } = layout;
  const w = cols * SAMPLE, h = rows * SAMPLE;
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(main!, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const M = cols * rows;
  const feat = new Float32Array(M * FEAT_LEN);
  const rgb = new Float32Array(M * 3);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    computeFeature(px, w, x * SAMPLE, y * SAMPLE, feat, i * FEAT_LEN, rgb, i * 3);
  }
  return { feat, rgb };
}

async function match(layout: Layout, folderIds: string[], options: Omit<MatchOptions, 'cols' | 'rows'>) {
  if (!main) throw new Error('Choose a main photo first');
  const t0 = performance.now();
  post({ type: 'progress', stage: 'Reading tile photos', done: 0, total: 1 });
  const tiles = await getTiles(folderIds);
  if (!tiles.length) throw new Error('The selected folders have no indexed photos yet');
  const N = tiles.length;
  const tileFeat = new Float32Array(N * FEAT_LEN);
  const tileRgb = new Float32Array(N * 3);
  tiles.forEach((t, i) => {
    tileFeat.set(new Float32Array(t.feat), i * FEAT_LEN);
    tileRgb.set(t.rgb, i * 3);
  });
  post({ type: 'progress', stage: 'Choosing photos', done: 0, total: 1 });
  const cells = describeCells(layout);
  const res = matchTiles(cells.feat, tileFeat, N, { ...options, cols: layout.cols, rows: layout.rows });
  plan = { layout, keys: tiles.map((t) => t.key), rgb: tileRgb, assign: res.assign, cellRgb: cells.rgb };
  post({
    type: 'match', distinct: res.distinct, total: N, meanCost: res.meanCost,
    limitRaised: res.limitRaised, spacingViolations: res.spacingViolations, ms: performance.now() - t0,
  });
}

async function render(scale: number, blend: number, tint: number, format: 'jpeg' | 'png' | 'bitmap') {
  if (!plan || !main) throw new Error('Nothing to draw yet');
  const { layout, assign, keys } = plan;
  const cell = Math.max(1, Math.round(layout.cell * scale));
  const W = layout.cols * cell, H = layout.rows * cell;
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: tint > 0 })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // Draw each photo once into all the cells that use it.
  const cellsOf = new Map<number, number[]>();
  assign.forEach((t, c) => {
    let l = cellsOf.get(t);
    if (!l) cellsOf.set(t, (l = []));
    l.push(c);
  });
  let done = 0;
  const total = cellsOf.size;
  for (const [t, cells] of cellsOf) {
    const blob = await getThumb(keys[t]);
    if (blob) {
      const bmp = await createImageBitmap(blob);
      for (const c of cells) {
        const x = (c % layout.cols) * cell, y = Math.floor(c / layout.cols) * cell;
        ctx.drawImage(bmp, x, y, cell, cell);
        if (tint > 0) {
          // Shift the tile's colour toward the colour of the area it replaces.
          const img = ctx.getImageData(x, y, cell, cell);
          const d = img.data;
          const dr = tint * (plan.cellRgb[c * 3] - plan.rgb[t * 3]);
          const dg = tint * (plan.cellRgb[c * 3 + 1] - plan.rgb[t * 3 + 1]);
          const db = tint * (plan.cellRgb[c * 3 + 2] - plan.rgb[t * 3 + 2]);
          for (let p = 0; p < d.length; p += 4) { d[p] += dr; d[p + 1] += dg; d[p + 2] += db; }
          ctx.putImageData(img, x, y);
        }
      }
      bmp.close();
    }
    if (++done % 50 === 0) post({ type: 'progress', stage: 'Drawing', done, total });
  }
  if (blend > 0) {
    ctx.globalAlpha = blend;
    const { crop } = layout;
    ctx.drawImage(main, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  if (format === 'bitmap') {
    const bitmap = canvas.transferToImageBitmap();
    post({ type: 'render', bitmap, width: W, height: H }, [bitmap]);
  } else {
    post({ type: 'progress', stage: 'Saving file', done: 0, total: 1 });
    const blob = await canvas.convertToBlob(format === 'png' ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.95 });
    post({ type: 'render', blob, width: W, height: H });
  }
}

self.onmessage = async (e: MessageEvent<MosaicRequest>) => {
  const m = e.data;
  try {
    if (m.type === 'main') await setMain(m.file, m.name);
    else if (m.type === 'match') await match(m.layout, m.folderIds, m.options);
    else if (m.type === 'render') await render(m.scale, m.blend, m.tint, m.format ?? 'bitmap');
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
