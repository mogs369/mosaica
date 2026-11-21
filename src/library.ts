// Adding and re-scanning photo folders. Only new or changed photos are
// processed again, so re-scanning a big folder after adding a few photos is quick.

import { IMAGE_EXT } from './core/decode';
import { countTiles, deleteTiles, getFolders, getTileStamps, putFolder, type FolderRecord } from './db';
import type { IndexJob, IndexReply } from './workers/index.worker';

export interface ScanProgress {
  folder: string;
  phase: 'listing' | 'indexing' | 'done' | 'cancelled';
  found: number;
  done: number;
  total: number;
  skipped: number;
  errors: { path: string; error: string }[];
}

type Source = { path: string; get: () => Promise<File> };

export const canPickFolders = typeof (window as any).showDirectoryPicker === 'function';

let cancelled = false;
export function cancelScan() {
  cancelled = true;
}

async function* walk(dir: FileSystemDirectoryHandle, prefix = ''): AsyncGenerator<Source> {
  for await (const [name, h] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
    if (name.startsWith('.') || name.startsWith('$')) continue;
    if (h.kind === 'directory') yield* walk(h as FileSystemDirectoryHandle, `${prefix}${name}/`);
    else if (IMAGE_EXT.test(name)) yield { path: prefix + name, get: () => (h as FileSystemFileHandle).getFile() };
  }
}

function newId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Ask Chrome/Edge for a folder and index it. */
export async function addFolderWithPicker(onProgress: (p: ScanProgress) => void): Promise<FolderRecord | null> {
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await (window as any).showDirectoryPicker({ id: 'mosaica-tiles', mode: 'read' });
  } catch {
    return null; // user closed the dialog
  }
  void navigator.storage?.persist?.();
  const existing = await getFolders();
  for (const f of existing) {
    if (f.handle && (await f.handle.isSameEntry(handle))) {
      f.handle = handle;
      await scanFolder(f, onProgress);
      return f;
    }
  }
  const folder: FolderRecord = { id: newId(), name: handle.name, handle, addedAt: Date.now(), count: 0 };
  await putFolder(folder);
  await scanFolder(folder, onProgress);
  return folder;
}

/** Fallback for browsers without folder access: a file list from <input webkitdirectory>. */
export async function addFolderFromFiles(files: File[], onProgress: (p: ScanProgress) => void): Promise<FolderRecord | null> {
  const images = files.filter((f) => IMAGE_EXT.test(f.name));
  if (!files.length) return null;
  void navigator.storage?.persist?.();
  const rel = (f: File) => ((f as any).webkitRelativePath as string) || f.name;
  const top = rel(files[0]).split('/')[0] || 'Photos';
  const existing = (await getFolders()).find((f) => !f.handle && f.name === top);
  const folder: FolderRecord = existing ?? { id: newId(), name: top, addedAt: Date.now(), count: 0 };
  if (!existing) await putFolder(folder);
  const sources: Source[] = images.map((f) => ({ path: rel(f).split('/').slice(1).join('/') || f.name, get: async () => f }));
  await scanFolder(folder, onProgress, sources);
  return folder;
}

/** Re-scan a saved folder (asks for permission again if Chrome needs it). */
export async function rescanFolder(folder: FolderRecord, onProgress: (p: ScanProgress) => void): Promise<boolean> {
  if (!folder.handle) return false;
  const h = folder.handle as any;
  if ((await h.queryPermission?.({ mode: 'read' })) !== 'granted') {
    if ((await h.requestPermission?.({ mode: 'read' })) !== 'granted') return false;
  }
  await scanFolder(folder, onProgress);
  return true;
}

async function scanFolder(folder: FolderRecord, onProgress: (p: ScanProgress) => void, given?: Source[]): Promise<void> {
  cancelled = false;
  const p: ScanProgress = { folder: folder.name, phase: 'listing', found: 0, done: 0, total: 0, skipped: 0, errors: [] };
  onProgress(p);
  const stamps = await getTileStamps(folder.id);

  const sources: Source[] = [];
  if (given) sources.push(...given);
  else {
    let last = 0;
    for await (const s of walk(folder.handle!)) {
      if (cancelled) break;
      sources.push(s);
      p.found = sources.length;
      if (performance.now() - last > 200) { onProgress(p); last = performance.now(); }
    }
  }
  p.found = p.total = sources.length;
  p.phase = 'indexing';
  onProgress(p);

  const seen = new Set<string>();
  const poolSize = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
  const workers = Array.from({ length: poolSize }, () => new Worker(new URL('./workers/index.worker.ts', import.meta.url), { type: 'module' }));
  let next = 0;
  let lastReport = 0;
  const report = () => {
    if (performance.now() - lastReport > 150) { onProgress(p); lastReport = performance.now(); }
  };

  const runWorker = async (w: Worker) => {
    while (!cancelled && next < sources.length) {
      const s = sources[next++];
      seen.add(s.path);
      let file: File;
      try {
        file = await s.get();
      } catch (err) {
        p.errors.push({ path: s.path, error: `Could not open: ${(err as Error).message}` });
        p.done++;
        report();
        continue;
      }
      const old = stamps.get(s.path);
      if (old && old.size === file.size && old.lastModified === file.lastModified) {
        p.skipped++;
        p.done++;
        report();
        continue;
      }
      const reply = await new Promise<IndexReply>((resolve) => {
        w.onmessage = (e: MessageEvent<IndexReply>) => resolve(e.data);
        w.postMessage({ id: next, folderId: folder.id, path: s.path, file } satisfies IndexJob);
      });
      if (!reply.ok) p.errors.push({ path: s.path, error: reply.error ?? 'Unknown error' });
      p.done++;
      report();
    }
  };
  await Promise.all(workers.map(runWorker));
  workers.forEach((w) => w.terminate());

  if (!cancelled) {
    // Forget photos that are no longer in the folder.
    const gone = [...stamps.keys()].filter((path) => !seen.has(path));
    if (gone.length) await deleteTiles(gone.map((path) => `${folder.id}/${path}`));
  }
  folder.count = await countTiles(folder.id);
  folder.scannedAt = Date.now();
  await putFolder(folder);
  p.phase = cancelled ? 'cancelled' : 'done';
  onProgress(p);
}
