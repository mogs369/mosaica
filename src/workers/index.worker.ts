/// <reference lib="webworker" />
// Indexes one photo at a time: decode, centre-crop to a 256 px square
// thumbnail, compute its colour feature, save both in IndexedDB.

import { decodeImage } from '../core/decode';
import { computeFeature, FEAT_LEN, SAMPLE } from '../core/features';
import { putTile, type TileRecord } from '../db';

export const THUMB = 256;

export interface IndexJob {
  id: number;
  folderId: string;
  path: string;
  file: File;
}
export interface IndexReply {
  id: number;
  ok: boolean;
  error?: string;
}

const thumbCanvas = new OffscreenCanvas(THUMB, THUMB);
const tctx = thumbCanvas.getContext('2d')!;
const small = new OffscreenCanvas(SAMPLE, SAMPLE);
const sctx = small.getContext('2d', { willReadFrequently: true })!;

async function indexOne(job: IndexJob): Promise<void> {
  const bmp = await decodeImage(job.file, job.path);
  const { width, height } = bmp;
  const side = Math.min(width, height);
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.fillStyle = '#fff'; // transparent areas count as white, here and when drawn
  tctx.fillRect(0, 0, THUMB, THUMB);
  tctx.drawImage(bmp, (width - side) / 2, (height - side) / 2, side, side, 0, 0, THUMB, THUMB);
  bmp.close();

  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(thumbCanvas, 0, 0, SAMPLE, SAMPLE);
  const px = sctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
  const feat = new Float32Array(FEAT_LEN);
  const rgb = [0, 0, 0];
  computeFeature(px, SAMPLE, 0, 0, feat, 0, rgb, 0);

  const thumb = await thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  const rec: TileRecord = {
    key: `${job.folderId}/${job.path}`,
    folderId: job.folderId,
    path: job.path,
    size: job.file.size,
    lastModified: job.file.lastModified,
    width,
    height,
    feat: feat.buffer,
    rgb: [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])],
  };
  await putTile(rec, thumb);
}

self.onmessage = async (e: MessageEvent<IndexJob>) => {
  const job = e.data;
  try {
    await indexOne(job);
    postMessage({ id: job.id, ok: true } satisfies IndexReply);
  } catch (err) {
    postMessage({ id: job.id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies IndexReply);
  }
};
