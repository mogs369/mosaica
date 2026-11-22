# Mosaica: project log and journal

A running record of where the project stands, so work can resume in a new chat
without the old conversation. **Newest entries go at the top of the Journal.**

> Note: this log was first written on 2026-11-22 from the repository itself
> (commits, code, CI runs, the live site). The original chat was not available,
> so decisions are described as they appear in the code and commit messages.

---

## Status at a glance (2026-11-22)

| Item | State |
| --- | --- |
| Version | 1.0.0, first working version, in use |
| Live site | https://mogs369.github.io/mosaica/ (responds, HTTP 200) |
| `main` branch | 3 commits, latest `f66ae03` |
| Working branch | `claude/admiring-hamilton-e5k3e9`, same as `main` plus this log |
| CI / deploy | GitHub Actions "Test and deploy": last 3 push runs **succeeded** (one manual re-run was cancelled, which is harmless) |
| Type check | passes (`npm run typecheck`) |
| Unit tests | 10 pass; 4 benchmark tests are skipped on purpose (run with `BENCH=1 npm test`) |
| Build | passes; 15 files precached for offline use (about 2 MB) |
| Open pull requests | none |
| Open issues | none |

---

## What Mosaica is

An offline photo mosaic maker that runs in Chrome or Edge on a Windows laptop.
You add a folder of photos (for example one trip), pick one main photo, and it
rebuilds the main photo out of the folder's photos. Photos never leave the
computer. After the first online visit it is installed as an app and works with
no internet.

Who it is for: a non-technical user who gets photos from iCloud onto the laptop
(iCloud for Windows or icloud.com), possibly with internet only at the library.
That is why offline use, HEIC support and the plain-language `GUIDE.md` matter.

### Features in place

- Add photo folders, subfolders included. Uses Chrome's folder access (so the
  folder is remembered); falls back to a plain folder picker in other browsers.
- Reads JPEG, PNG, WebP, GIF, BMP, AVIF, TIFF and iPhone **HEIC/HEIF**
  (through libheif-js). Live Photo `.MOV` parts are skipped.
- Each photo is processed once: a 256 px thumbnail plus colour data kept in
  IndexedDB (about 20 KB per photo). **Update** only processes new or changed photos.
- Matching uses Lab colour: an average plus a 4 × 4 grid (51 numbers per photo),
  so layout counts as well as colour. Candidates come from a colour index, then
  are refined by swaps.
- Photo-choice modes: *Show every photo*, *Best likeness*, *Never repeat a photo*,
  plus *Keep repeats apart* (minimum spacing), *Main photo blended in* and
  *Tint tiles*.
- Sizes: Letter, 8 × 10, A4, 5 × 7, 4 × 6 at 300 dpi, plus screen size.
  Paper turns to suit the photo. JPEG or PNG export with the dpi written into the file.
- Zoomable preview, drag-and-drop main photo, "Ready to work offline" badge,
  Install app button, auto-update when online.

### Code map

| Path | What it does |
| --- | --- |
| `src/main.ts` | UI wiring, controls, preview, export |
| `src/library.ts` | Adding / updating / removing folders, folder-access fallback |
| `src/db.ts` | IndexedDB storage for folders, thumbnails, features |
| `src/core/features.ts` | 51-number Lab colour description of a photo or cell |
| `src/core/match.ts` | Colour index, tile assignment, repeat and spacing rules, swaps |
| `src/core/layout.ts` | Print size presets and tile grid at 300 dpi |
| `src/core/dpi.ts` | Writes dpi into JPEG and PNG files |
| `src/core/decode.ts` | Image decoding, including HEIC |
| `src/core/color.ts` | RGB to Lab conversion |
| `src/workers/index.worker.ts` | Background thumbnail + feature creation |
| `src/workers/mosaic.worker.ts` | Background matching and drawing |
| `tests/core.test.ts` | Engine unit tests |
| `tests/bench.test.ts` | Speed benchmarks (only with `BENCH=1`) |
| `e2e/smoke.mjs` | Full browser test with Playwright; `APP_URL=...` tests the live site |
| `.github/workflows/deploy.yml` | On push to `main`: type check, test, build, deploy to GitHub Pages |
| `README.md` | Overview and developer notes |
| `GUIDE.md` | Step-by-step guide for the person using the app |

### Commands

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
node e2e/smoke.mjs <testdata-dir> <out-dir>
```

The smoke test expects a test-data folder containing a `Trip photos` folder plus
`main_beach.jpg` / `main_beach.heic`. Test data is not in the repository.

---

## Known limits and open points

- Thumbnails are 256 px, so tiles look sharp up to about 2 cm each in print.
  Below about 12 tiles across on letter paper they get soft (documented in GUIDE.md).
- Clearing Chrome's "cookies and site data" deletes Mosaica's stored thumbnails;
  folders then have to be added again (documented in GUIDE.md).
- Cloud-only iCloud files can't be read until downloaded; they are listed as
  "could not be read".
- License is `UNLICENSED` (private). libheif-js is LGPL-3.0.
- No issues or to-do comments are open in the code.

## Ideas for next steps (not started)

None are committed to. Possible directions if wanted:

- Real-world check on the target laptop with a large folder (thousands of HEIC photos).
- Larger thumbnails as an option, for big-tile prints.
- Save and reload mosaic settings per project.
- Commit a small test-data set so the browser test can run in CI.

---

## Journal

### 2026-11-22: Project log created
- Previous chat is being deleted, so this file was written to keep the history.
- Checked state: type check, unit tests and build all pass; live site is up;
  last CI deploy succeeded; nothing open on GitHub.

### 2026-11-21 19:10 UTC: Smoke test improvements (`f66ae03`)
- Browser test now also checks the install manifest.
- `APP_URL` lets the same test run against the deployed site instead of the local build.
- Deployed successfully (CI run #4).

### 2026-11-21 18:27 UTC: User guide (`c5c9905`)
- Added `GUIDE.md`: installing for offline use, getting photos from iCloud onto a
  Windows laptop, making and printing a mosaic, troubleshooting table, privacy.
- Example folder names changed to generic ones (`Summer trip`, `Trip photos`).
- Deployed successfully (CI run #3).

### 2026-11-21 18:20 UTC: First working version (`60a9c81`)
- Whole app built: folder library with HEIC support, colour-feature matching
  engine, print sizes at 300 dpi, blend/tint, zoomable preview, offline install (PWA).
- Unit tests, Playwright smoke test and GitHub Pages deployment added.
- First deploy succeeded (CI run #1, second attempt). A manual run (#2) was
  cancelled because the next push replaced it.
