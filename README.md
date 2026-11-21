# Mosaica

Photo mosaics made from your own photo folders, for example a portrait from
New Zealand 2020 built only out of the photos from that trip.

- Runs in Chrome (or Edge) on your own computer. **Your photos are never uploaded.**
- After the first visit it **works fully offline**, so no connection is needed to make mosaics.
- Reads iPhone **HEIC** photos directly; Live Photo video parts (`.MOV`) are skipped.
- Exports print-ready files at 300 dpi (letter, 8×10, A4, 5×7, 4×6) or screen size.

## Using it

1. **Open the app once while online** (at the library is fine) and click **Install app**
   in the top right, or use the install icon in Chrome's address bar. From then on it opens
   like a normal program and works with no internet.
2. **Add folder…**: pick a folder of photos, e.g. `New Zealand 2020`. Subfolders are included.
   Mosaica makes a small thumbnail of every photo and remembers the folder, so this only
   happens once. **Update** picks up photos added later; **Remove** only forgets
   Mosaica's thumbnails and never touches your photos.
3. **Choose photo…**: the main picture. You can also drag a photo onto the preview.
4. Pick the **size** and how many **tiles across**. Fewer tiles means each photo is easier
   to recognise; more tiles means the main picture is clearer.
5. **Look**:
   - *Show every photo*: every photo in the folder appears, spread evenly.
   - *Best likeness*: the closest-matching photos, repeated as needed.
   - *Never repeat a photo*: each photo at most once (or, if there are fewer photos than tiles, every photo is used).
   - *Keep repeats apart*: no copies of the same photo within that many tiles.
   - *Main photo blended in*: lays the main picture faintly over the tiles. 0 % shows pure tiles.
   - *Tint tiles*: nudges each tile's colour toward the area it replaces.
6. **Save full-size file**: the file goes to your Downloads folder.

### Getting photos from iCloud onto the laptop

Mosaica reads ordinary folders. To get iCloud photos into one:

- **iCloud for Windows** (Microsoft Store) shows iCloud Photos in File Explorer. Files
  that are only in the cloud must be downloaded before Mosaica can read them. Right-click
  a folder and choose *Always keep on this device*, then let it finish while you have a
  connection. Files that weren't downloaded show up as "could not be read" and are skipped.
- Or, at **icloud.com/photos**, select photos (up to 1,000 at a time) and download them.
  Choose *Most Compatible* to get JPEGs, though HEIC also works.

Mosaica's thumbnails are small (about 20 KB per photo), but they are **not a backup** of
your photos. Keep the originals somewhere safe, such as an external drive.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # engine unit tests
npm run build      # production build in dist/
node e2e/smoke.mjs <testdata-dir> <out-dir>   # browser test against the build (needs Playwright)
```

Every push to `main` is type-checked, tested, built and deployed to GitHub Pages by
`.github/workflows/deploy.yml`.

### How it works

- `src/core/features.ts`: each photo and each cell of the main photo is described by its
  average Lab colour plus a 4 × 4 grid of Lab colours (51 numbers), so layout counts as well
  as colour.
- `src/core/match.ts`: finds candidates through a colour index, then assigns photos to cells.
  It gives every photo a cell first (*show every*), fills the rest under the repeat and
  spacing rules, then improves the result with swaps.
- `src/workers/index.worker.ts`: decodes photos (including HEIC via libheif), saves a
  256 px square thumbnail and its features in IndexedDB.
- `src/workers/mosaic.worker.ts`: matching and drawing at preview or print size.

Third-party: [libheif-js](https://github.com/catdad-experiments/libheif-js) (LGPL-3.0) for HEIC decoding.
