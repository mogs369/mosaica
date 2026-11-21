import './style.css';
import { computeLayout, PRESETS, type Layout } from './core/layout';
import { setJpegDpi, setPngDpi } from './core/dpi';
import { DPI } from './core/layout';
import { deleteFolder, getFolders, type FolderRecord } from './db';
import { addFolderFromFiles, addFolderWithPicker, canPickFolders, cancelScan, rescanFolder, type ScanProgress } from './library';
import type { MosaicReply, MosaicRequest } from './workers/mosaic.worker';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------------------------------------------------------------- settings
interface Settings {
  preset: string; across: number; variety: 'every' | 'likeness' | 'norepeat';
  spacing: number; blend: number; tint: number; format: 'jpeg' | 'png'; off: string[];
}
const DEFAULTS: Settings = { preset: 'letter', across: 32, variety: 'every', spacing: 2, blend: 10, tint: 0, format: 'jpeg', off: [] };
function loadSettings(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('mosaica-settings') ?? '{}') }; } catch { return { ...DEFAULTS }; }
}
const settings = loadSettings();
function saveSettings() {
  try { localStorage.setItem('mosaica-settings', JSON.stringify(settings)); } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------- mosaic worker
const worker = new Worker(new URL('./workers/mosaic.worker.ts', import.meta.url), { type: 'module' });
let pending: { type: string; resolve: (m: MosaicReply) => void; reject: (e: Error) => void } | null = null;
worker.onmessage = (e: MessageEvent<MosaicReply>) => {
  const m = e.data;
  if (m.type === 'progress') { setStatus(`${m.stage}${m.total > 1 ? ` ${m.done} / ${m.total}` : '…'}`); return; }
  const p = pending; pending = null;
  if (!p) return;
  if (m.type === 'error') p.reject(new Error(m.message)); else p.resolve(m);
};
function call<T extends MosaicReply['type']>(req: MosaicRequest, transfer: Transferable[] = []): Promise<Extract<MosaicReply, { type: T }>> {
  return new Promise((resolve, reject) => {
    pending = { type: req.type, resolve: resolve as (m: MosaicReply) => void, reject };
    worker.postMessage(req, transfer);
  });
}

// ---------------------------------------------------------------- state
let folders: FolderRecord[] = [];
let mainInfo: { width: number; height: number; name: string } | null = null;
let layout: Layout | null = null;
let matched = false;
let scanning = false;

function setStatus(text: string, error = false) {
  const s = $('status');
  s.textContent = text;
  s.classList.toggle('error', error);
}
const fmt = (n: number) => n.toLocaleString('en-US');

// ---------------------------------------------------------------- folders UI
function selectedFolderIds(): string[] {
  return folders.filter((f) => !settings.off.includes(f.id) && f.count > 0).map((f) => f.id);
}

function renderFolders() {
  const ul = $('folders');
  ul.replaceChildren();
  for (const f of folders) {
    const li = document.createElement('li');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !settings.off.includes(f.id);
    cb.title = 'Use this folder for tiles';
    cb.onchange = () => {
      settings.off = cb.checked ? settings.off.filter((x) => x !== f.id) : [...settings.off, f.id];
      saveSettings();
      schedule('match');
    };
    const name = document.createElement('div');
    name.innerHTML = `<div class="fname"></div><div class="fcount"></div>`;
    (name.firstChild as HTMLElement).textContent = f.name;
    (name.lastChild as HTMLElement).textContent = `${fmt(f.count)} photo${f.count === 1 ? '' : 's'}`;
    const actions = document.createElement('div');
    actions.className = 'factions';
    const rescan = document.createElement('button');
    rescan.textContent = 'Update';
    rescan.title = 'Look for new or changed photos in this folder';
    rescan.onclick = async () => {
      if (scanning) return;
      if (f.handle) {
        await runScan(async (cb) => {
          if (!(await rescanFolder(f, cb))) setStatus('Permission to read the folder was not given.', true);
        });
      } else {
        $('folder-input').click(); // pick the same folder again
      }
    };
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.title = 'Remove from Mosaica (your photos are not touched)';
    remove.onclick = async () => {
      if (scanning) return;
      if (!confirm(`Remove “${f.name}” from Mosaica?\n\nYour photos are not deleted; only Mosaica's thumbnails are.`)) return;
      await deleteFolder(f.id);
      await refreshFolders();
      schedule('match');
    };
    actions.append(rescan, remove);
    li.append(cb, name, actions);
    ul.append(li);
  }
}

async function refreshFolders() {
  folders = await getFolders();
  renderFolders();
}

async function runScan(job: (cb: (p: ScanProgress) => void) => Promise<unknown>) {
  scanning = true;
  $('add-folder').toggleAttribute('disabled', true);
  const box = $('scan');
  box.hidden = false;
  const onProgress = (p: ScanProgress) => {
    const label = $('scan-label');
    const bar = $<HTMLProgressElement>('scan-bar');
    if (p.phase === 'listing') {
      label.textContent = `Looking through “${p.folder}”… ${fmt(p.found)} photos found`;
      bar.removeAttribute('value');
    } else {
      const verb = p.phase === 'done' ? 'Done' : p.phase === 'cancelled' ? 'Stopped' : 'Preparing';
      label.textContent = `${verb}: ${fmt(p.done)} / ${fmt(p.total)} photos${p.skipped ? ` (${fmt(p.skipped)} already done)` : ''}`;
      bar.max = Math.max(1, p.total);
      bar.value = p.done;
    }
    $('scan-cancel').hidden = p.phase === 'done' || p.phase === 'cancelled';
    const det = $('scan-errors');
    det.hidden = p.errors.length === 0;
    if (p.errors.length) {
      det.querySelector('summary')!.textContent = `${p.errors.length} file${p.errors.length > 1 ? 's' : ''} could not be read`;
      const ul = det.querySelector('ul')!;
      ul.replaceChildren(...p.errors.slice(0, 200).map((e) => {
        const li = document.createElement('li');
        li.textContent = `${e.path}: ${e.error}`;
        return li;
      }));
    }
  };
  try {
    await job(onProgress);
  } catch (err) {
    setStatus(`Could not read the folder: ${(err as Error).message}`, true);
  } finally {
    scanning = false;
    $('add-folder').toggleAttribute('disabled', false);
    await refreshFolders();
    schedule('match');
  }
}

$('add-folder').onclick = () => {
  if (canPickFolders) void runScan((cb) => addFolderWithPicker(cb));
  else $('folder-input').click();
};
$<HTMLInputElement>('folder-input').onchange = (e) => {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length) void runScan((cb) => addFolderFromFiles(files, cb));
};
$('scan-cancel').onclick = () => cancelScan();

// ---------------------------------------------------------------- main photo
async function setMainFile(file: File) {
  setStatus('Opening main photo…');
  try {
    const r = await call<'main'>({ type: 'main', file, name: file.name });
    mainInfo = { width: r.width, height: r.height, name: file.name };
    const c = document.createElement('canvas');
    c.width = r.preview.width; c.height = r.preview.height;
    c.getContext('2d')!.drawImage(r.preview, 0, 0);
    $<HTMLImageElement>('main-thumb').src = c.toDataURL('image/jpeg', 0.8);
    $('main-name').textContent = `${file.name} · ${r.width} × ${r.height}`;
    $('main-info').hidden = false;
    $('pick-main').textContent = 'Choose a different photo…';
    schedule('match');
  } catch (err) {
    setStatus(`Could not open that photo: ${(err as Error).message}`, true);
  }
}
$('pick-main').onclick = () => $('main-input').click();
$<HTMLInputElement>('main-input').onchange = (e) => {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (f) void setMainFile(f);
};
// Drop a photo onto the preview area to use it as the main photo.
$('viewport').addEventListener('dragover', (e) => e.preventDefault());
$('viewport').addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) void setMainFile(f);
});

// ---------------------------------------------------------------- controls
const presetSel = $<HTMLSelectElement>('preset');
for (const p of PRESETS) presetSel.add(new Option(p.label, p.id));

function bindRange(id: keyof Settings, outFmt: (v: number) => string, kind: 'match' | 'render') {
  const input = $<HTMLInputElement>(id);
  const out = $(`${id}-out`);
  input.value = String(settings[id]);
  out.textContent = outFmt(Number(input.value));
  input.oninput = () => {
    (settings as any)[id] = Number(input.value);
    out.textContent = outFmt(Number(input.value));
    saveSettings();
    if (id === 'across') updateLayout();
    schedule(kind);
  };
}
bindRange('across', (v) => String(v), 'match');
bindRange('spacing', (v) => (v === 0 ? 'off' : `${v} tile${v > 1 ? 's' : ''}`), 'match');
bindRange('blend', (v) => `${v}%`, 'render');
bindRange('tint', (v) => `${v}%`, 'render');
function bindSelect(id: 'preset' | 'variety' | 'format', kind: 'match' | 'none') {
  const sel = $<HTMLSelectElement>(id);
  sel.value = settings[id];
  sel.onchange = () => {
    (settings as any)[id] = sel.value;
    saveSettings();
    updateLayout();
    if (kind !== 'none') schedule(kind);
  };
}
bindSelect('preset', 'match');
bindSelect('variety', 'match');
bindSelect('format', 'none');

function updateLayout() {
  if (!mainInfo) { layout = null; return; }
  const preset = PRESETS.find((p) => p.id === settings.preset) ?? PRESETS[0];
  layout = computeLayout(mainInfo.width, mainInfo.height, preset, settings.across);
  const { cols, rows, cell, outW, outH, printIn } = layout;
  const size = printIn
    ? `printed ${printIn[0].toFixed(1)} × ${printIn[1].toFixed(1)} in, each tile ${(cell / DPI * 25.4).toFixed(1)} mm`
    : `${fmt(outW)} × ${fmt(outH)} px, each tile ${cell} px`;
  $('size-readout').textContent = `${cols} × ${rows} = ${fmt(cols * rows)} tiles · ${size}`;
  if (cell < 24) $('size-readout').textContent += ' · very small tiles: photos will be hard to make out';
}

// ---------------------------------------------------------------- run
let timer = 0;
let want: 'match' | 'render' | null = null;
let busy = false;

function schedule(kind: 'match' | 'render') {
  if (kind === 'match' || want === null) want = kind === 'match' || want === 'match' ? 'match' : 'render';
  clearTimeout(timer);
  timer = window.setTimeout(run, kind === 'match' ? 350 : 120);
}

async function run() {
  if (busy || !want) return;
  updateLayout();
  const ids = selectedFolderIds();
  if (!layout || !mainInfo) {
    want = null;
    if (folders.length && !mainInfo) setStatus('Now choose the main photo.');
    return;
  }
  if (!ids.length) {
    want = null;
    setStatus(folders.length ? 'Tick at least one folder that has photos.' : 'Add a folder of photos to use as tiles.');
    return;
  }
  busy = true;
  const kind = want;
  want = null;
  try {
    if (kind === 'match' || !matched) {
      const variety = settings.variety;
      const r = await call<'match'>({
        type: 'match', layout, folderIds: ids,
        options: { showEvery: variety === 'every', maxUses: variety === 'norepeat' ? 1 : 0, spacing: settings.spacing, seed: 1 },
      });
      matched = true;
      lastMatch = r;
    }
    await drawPreview();
  } catch (err) {
    setStatus((err as Error).message, true);
  } finally {
    busy = false;
    if (want) void run();
  }
}

let lastMatch: Extract<MosaicReply, { type: 'match' }> | null = null;
let zoomed = false;

async function drawPreview() {
  if (!layout) return;
  const long = Math.max(layout.outW, layout.outH);
  const target = zoomed ? 4200 : 1800;
  const scale = Math.min(1, target / long);
  const r = await call<'render'>({ type: 'render', scale, blend: settings.blend / 100, tint: settings.tint / 100, format: 'bitmap' });
  const canvas = $<HTMLCanvasElement>('preview');
  canvas.width = r.width; canvas.height = r.height;
  canvas.getContext('bitmaprenderer')
    ? (canvas.getContext('bitmaprenderer') as ImageBitmapRenderingContext).transferFromImageBitmap(r.bitmap!)
    : canvas.getContext('2d')!.drawImage(r.bitmap!, 0, 0);
  canvas.hidden = false;
  fitPreview();
  $('empty').hidden = true;
  $('zoom').hidden = false;
  $<HTMLButtonElement>('export').disabled = false;
  if (lastMatch) {
    const m = lastMatch;
    const cells = layout.cols * layout.rows;
    let text = `${fmt(cells)} tiles · ${fmt(m.distinct)} different photos used`;
    text += m.distinct === m.total ? ` (all ${fmt(m.total)})` : ` of ${fmt(m.total)}`;
    if (m.limitRaised) text += ' · not enough photos for that repeat rule, so some repeat more';
    setStatus(text);
  }
}

/** In fit mode, size the preview to the window (keeping its shape). */
function fitPreview() {
  const canvas = $<HTMLCanvasElement>('preview');
  if (zoomed || !canvas.width) return;
  const vp = $('viewport');
  const availW = vp.clientWidth - 32, availH = vp.clientHeight - 32;
  const k = Math.min(availW / canvas.width, availH / canvas.height, 1);
  canvas.style.width = `${Math.floor(canvas.width * k)}px`;
  canvas.style.height = `${Math.floor(canvas.height * k)}px`;
}
window.addEventListener('resize', fitPreview);

$('zoom').onclick = async () => {
  zoomed = !zoomed;
  $('zoom').textContent = zoomed ? 'Fit to window' : 'Zoom in';
  $('viewport').classList.toggle('zoomed', zoomed);
  if (!busy) { busy = true; try { await drawPreview(); } finally { busy = false; } }
};

// ---------------------------------------------------------------- export
$('export').onclick = async () => {
  if (!layout || !mainInfo || busy) return;
  busy = true;
  const btn = $<HTMLButtonElement>('export');
  btn.disabled = true;
  try {
    const format = settings.format;
    const r = await call<'render'>({ type: 'render', scale: 1, blend: settings.blend / 100, tint: settings.tint / 100, format });
    let bytes = new Uint8Array(await r.blob!.arrayBuffer());
    if (layout.printIn) bytes = format === 'png' ? setPngDpi(bytes, DPI) : setJpegDpi(bytes, DPI);
    const base = mainInfo.name.replace(/\.[^.]+$/, '');
    const name = `${base} mosaic ${layout.cols}x${layout.rows}.${format === 'png' ? 'png' : 'jpg'}`;
    const url = URL.createObjectURL(new Blob([bytes], { type: format === 'png' ? 'image/png' : 'image/jpeg' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setStatus(`Saved “${name}” (${fmt(r.width)} × ${fmt(r.height)} px, ${(bytes.length / 1e6).toFixed(1)} MB) to your Downloads folder.`);
  } catch (err) {
    setStatus(`Could not save: ${(err as Error).message}`, true);
  } finally {
    busy = false;
    btn.disabled = false;
    if (want) void run();
  }
};

// ---------------------------------------------------------------- install / offline
let installEvent: any = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  $('install').hidden = false;
});
$('install').onclick = async () => {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  $('install').hidden = true;
};
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(() => { $('offline-badge').hidden = false; }).catch(() => {});
}

// ---------------------------------------------------------------- start
void refreshFolders().then(() => {
  if (!folders.length) setStatus('');
  else setStatus('Choose the main photo to start.');
});
