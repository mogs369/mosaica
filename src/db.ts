// Everything the app remembers lives in this browser's IndexedDB, on her
// laptop: folder list, one small thumbnail per photo and its colour data.
// Nothing is ever uploaded.

export interface FolderRecord {
  id: string;
  name: string;
  /** Saved folder access (Chrome/Edge). Missing for folders added via the fallback picker. */
  handle?: FileSystemDirectoryHandle;
  addedAt: number;
  scannedAt?: number;
  count: number;
}

export interface TileRecord {
  key: string; // `${folderId}/${relative path}`
  folderId: string;
  path: string;
  size: number;
  lastModified: number;
  width: number;
  height: number;
  /** FEAT_LEN floats */
  feat: ArrayBuffer;
  /** mean sRGB colour */
  rgb: [number, number, number];
}

export interface ThumbRecord {
  key: string;
  blob: Blob;
}

const DB_NAME = 'mosaica';
const VERSION = 1;

let dbp: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('folders', { keyPath: 'id' });
      const tiles = db.createObjectStore('tiles', { keyPath: 'key' });
      tiles.createIndex('folderId', 'folderId');
      db.createObjectStore('thumbs', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function getFolders(): Promise<FolderRecord[]> {
  const db = await openDb();
  const all = await req(db.transaction('folders').objectStore('folders').getAll());
  return (all as FolderRecord[]).sort((a, b) => a.addedAt - b.addedAt);
}

export async function putFolder(f: FolderRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('folders', 'readwrite');
  tx.objectStore('folders').put(f);
  await done(tx);
}

export async function putTile(tile: TileRecord, thumb: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['tiles', 'thumbs'], 'readwrite');
  tx.objectStore('tiles').put(tile);
  tx.objectStore('thumbs').put({ key: tile.key, blob: thumb } satisfies ThumbRecord);
  await done(tx);
}

/** Size and date of every photo already indexed in a folder, by path. */
export async function getTileStamps(folderId: string): Promise<Map<string, { size: number; lastModified: number }>> {
  const db = await openDb();
  const out = new Map<string, { size: number; lastModified: number }>();
  const tx = db.transaction('tiles');
  const idx = tx.objectStore('tiles').index('folderId');
  await new Promise<void>((resolve, reject) => {
    const cur = idx.openCursor(IDBKeyRange.only(folderId));
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return resolve();
      const t = c.value as TileRecord;
      out.set(t.path, { size: t.size, lastModified: t.lastModified });
      c.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
  return out;
}

export async function getTiles(folderIds: string[]): Promise<TileRecord[]> {
  const db = await openDb();
  const tx = db.transaction('tiles');
  const idx = tx.objectStore('tiles').index('folderId');
  const out: TileRecord[] = [];
  for (const id of folderIds) out.push(...((await req(idx.getAll(IDBKeyRange.only(id)))) as TileRecord[]));
  return out;
}

export async function countTiles(folderId: string): Promise<number> {
  const db = await openDb();
  return req(db.transaction('tiles').objectStore('tiles').index('folderId').count(IDBKeyRange.only(folderId)));
}

export async function getThumb(key: string): Promise<Blob | undefined> {
  const db = await openDb();
  const r = (await req(db.transaction('thumbs').objectStore('thumbs').get(key))) as ThumbRecord | undefined;
  return r?.blob;
}

export async function deleteTiles(keys: string[]): Promise<void> {
  const db = await openDb();
  for (let i = 0; i < keys.length; i += 500) {
    const tx = db.transaction(['tiles', 'thumbs'], 'readwrite');
    for (const k of keys.slice(i, i + 500)) {
      tx.objectStore('tiles').delete(k);
      tx.objectStore('thumbs').delete(k);
    }
    await done(tx);
  }
}

export async function deleteFolder(folderId: string): Promise<void> {
  const stamps = await getTileStamps(folderId);
  await deleteTiles([...stamps.keys()].map((p) => `${folderId}/${p}`));
  const db = await openDb();
  const tx = db.transaction('folders', 'readwrite');
  tx.objectStore('folders').delete(folderId);
  await done(tx);
}
