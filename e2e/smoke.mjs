// End-to-end check in Chromium against the production build.
// Usage: node e2e/smoke.mjs <testdata dir> <screenshot dir>
// (testdata: a "Trip photos" folder of photos plus main_beach.jpg / main_beach.heic)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Use a local Playwright if installed, otherwise the global one.
const pw = await import('playwright').catch(() =>
  import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(), 'playwright', 'index.js')).href));
const chromium = pw.chromium ?? pw.default.chromium;

const [data, shots] = process.argv.slice(2);
const folder = path.join(data, 'Trip photos');
fs.mkdirSync(shots, { recursive: true });

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4319', '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => server.stdout.on('data', (d) => /4319/.test(d) && r()));
const URL_ = 'http://localhost:4319/';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const status = () => page.locator('#status').textContent();
const waitStatus = (re, timeout = 120000) =>
  page.waitForFunction((src) => new RegExp(src).test(document.getElementById('status').textContent), re.source, { timeout });

await page.goto(URL_);
await page.waitForFunction(() => navigator.serviceWorker.controller || document.getElementById('offline-badge').hidden === false, null, { timeout: 30000 });

// 1) Add a folder through the fallback picker (<input webkitdirectory>).
let t0 = Date.now();
await page.setInputFiles('#folder-input', folder);
await page.waitForFunction(() => /^Done/.test(document.getElementById('scan-label').textContent), null, { timeout: 300000 });
console.log('indexed (fallback):', await page.locator('#scan-label').textContent(), `${Date.now() - t0} ms`);
console.log('errors listed:', await page.locator('#scan-errors summary').textContent());
console.log('folders:', await page.locator('.folders li').allTextContents());

// 2) Main photo (JPEG), default settings.
t0 = Date.now();
await page.setInputFiles('#main-input', path.join(data, 'main_beach.jpg'));
await waitStatus(/different photos used/);
console.log('preview:', await status(), `${Date.now() - t0} ms`);
console.log('size:', await page.locator('#size-readout').textContent());
await page.screenshot({ path: path.join(shots, '1-default.png') });

// 3) Change settings.
await page.locator('#across').fill('60');
await page.locator('#variety').selectOption('likeness');
await page.locator('#blend').fill('25');
await page.waitForTimeout(500);
await waitStatus(/different photos used/);
console.log('likeness 60 across:', await status());
console.log('size:', await page.locator('#size-readout').textContent());
await page.screenshot({ path: path.join(shots, '2-likeness.png') });

await page.locator('#variety').selectOption('norepeat');
await page.locator('#across').fill('20');
await page.waitForTimeout(500);
await waitStatus(/different photos used/);
console.log('no repeat 20 across:', await status());

// 4) Export full size.
await page.locator('#variety').selectOption('every');
await page.locator('#across').fill('32');
await page.locator('#blend').fill('10');
await page.waitForTimeout(600);
await waitStatus(/different photos used/);
t0 = Date.now();
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('#export')]);
const out = path.join(shots, dl.suggestedFilename());
await dl.saveAs(out);
console.log('exported:', dl.suggestedFilename(), fs.statSync(out).size, 'bytes', `${Date.now() - t0} ms`);
console.log('status:', await status());

// 5) HEIC main photo.
await page.setInputFiles('#main-input', path.join(data, 'main_beach.heic'));
await page.waitForFunction(() => /heic/.test(document.getElementById('main-name').textContent), null, { timeout: 60000 });
await waitStatus(/different photos used/);
console.log('heic main:', await page.locator('#main-name').textContent());

// 6) Real folder access (showDirectoryPicker) using a private test folder in the browser.
await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('Handle Test', { create: true });
  const sub = await dir.getDirectoryHandle('Sub', { create: true });
  const mk = async (d, name, color) => {
    const c = new OffscreenCanvas(300, 200); const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 300, 200);
    const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(await c.convertToBlob({ type: 'image/jpeg' })); await w.close();
  };
  await mk(dir, 'a.jpg', '#ff0000'); await mk(dir, 'b.jpg', '#00ff00'); await mk(sub, 'c.jpg', '#0000ff');
  window.showDirectoryPicker = async () => dir;
});
await page.click('#add-folder');
await page.waitForFunction(() => [...document.querySelectorAll('.folders li')].some((li) => /Handle Test.*3 photos/.test(li.textContent)), null, { timeout: 60000 });
// Add a photo, then "Update" should pick up only the new one.
await page.evaluate(async () => {
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Handle Test');
  const c = new OffscreenCanvas(100, 100); c.getContext('2d').fillRect(0, 0, 100, 100);
  const w = await (await dir.getFileHandle('d.png', { create: true })).createWritable(); await w.write(await c.convertToBlob()); await w.close();
});
await page.locator('.folders li', { hasText: 'Handle Test' }).getByRole('button', { name: 'Update' }).click();
await page.waitForFunction(() => /Done: 4 \/ 4 photos \(3 already done\)/.test(document.getElementById('scan-label').textContent), null, { timeout: 60000 });
console.log('handle folder rescan:', await page.locator('#scan-label').textContent());

// 7) Offline: reload with no network; folders must still be there and mosaics still work.
await ctx.setOffline(true);
await page.reload();
await page.waitForFunction(() => document.querySelectorAll('.folders li').length === 2, null, { timeout: 30000 });
console.log('offline reload folders:', await page.locator('.folders li').allTextContents());
await page.setInputFiles('#main-input', path.join(data, 'main_beach.jpg'));
await waitStatus(/different photos used/);
console.log('offline mosaic:', await status());
await page.screenshot({ path: path.join(shots, '3-offline.png') });

console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
server.kill();
process.exit(errors.length ? 1 : 0);
