# Mosaica: your guide

Mosaica turns one photo into a mosaic made of many others: for example one picture
from a trip, built only from the photos of that same trip.

It runs on your laptop in Chrome. **Your photos are never uploaded anywhere.** After
the first visit, **it works with no internet at all**.

---

## 1. First time: install it (needs internet once)

Do this somewhere with a connection, like the library.

1. Open **Chrome** and go to **https://mogs369.github.io/mosaica/**
2. Click **Install app** at the top right of the page (or the small install icon at the right end
   of Chrome's address bar), then confirm.
3. Mosaica now has its own icon, like any other program. Pin it to your taskbar if you like.
4. When **"Ready to work offline"** appears at the top right, you're set. From now on you can
   open Mosaica with no connection.

When you happen to be online, Mosaica quietly updates itself. You don't need to do anything.

---

## 2. Get your photos onto the laptop

Mosaica reads ordinary folders on your laptop. It can't reach into iCloud by itself, so the
photos you want to use need to be downloaded first. This is the part that needs internet,
so do it at the library.

**Option A: iCloud for Windows** (free in the Microsoft Store)

1. Sign in, then turn on **Photos**. Your iCloud photos appear in File Explorer.
2. Many of them are "cloud only" at first: they show a little cloud icon and aren't really on
   the laptop yet.
3. Right-click the folder you want (for example a trip or a month) and choose
   **Always keep on this device**. Wait until the cloud icons turn into green check marks.

**Option B: icloud.com in Chrome**

1. Go to **icloud.com/photos**, select the photos you want (up to 1,000 at a time) and
   download them. Choosing **Most Compatible** gives you JPEGs, but iPhone HEIC files work too.
2. Unzip them into a folder with a name you'll recognise, like `Summer trip`.

**Tips**
- Work **one project at a time**. Download one trip or theme, not the whole library.
- Live Photos come with a short video (`.MOV`). Mosaica ignores those and uses only the still photo.
- Mosaica stores only a small copy of each photo (about 20 KB), so even thousands of photos
  take little space. But **those copies are not a backup**. Keep your originals safe, for
  example on an external drive.

---

## 3. Make a mosaic

The left side of the window has five steps:

**1 · Tile photos**: click **Add folder…** and choose a folder, for example `Summer trip`.
Folders inside it are included too. Mosaica looks at every photo once, which takes a few
minutes for a few thousand. You'll see a progress bar, and you can keep working afterwards.
Mosaica remembers the folder next time.
- Tick or untick folders to choose which ones are used for this mosaic.
- **Update** checks for new or changed photos in that folder; only the new ones are processed.
- **Remove** makes Mosaica forget the folder. **Your photos are not touched.**

**2 · Main photo**: click **Choose photo…** and pick the picture the mosaic should show.
You can also drag a photo onto the big preview area.

**3 · Size**
- **Output**: the print size (Letter 8.5 × 11, 8 × 10, A4, 5 × 7, 4 × 6) or a screen version.
  Mosaica turns the paper to suit your photo (portrait or landscape) and crops the photo to fit.
- **Tiles across**: how many photos fit across the width.
  - *Fewer tiles* (15–25): each photo is bigger and easier to recognise, and the main image is looser.
  - *More tiles* (40–60): the main image is sharper, and each photo is tiny.
  - About **32 across** is a good place to start on letter paper.
  - The line under the slider tells you the tile count and how big each tile will print.

**4 · Look**
- **Photo choice**
  - *Show every photo*: every photo in the folder appears at least once, spread evenly.
    Best when the point is to "see the whole trip".
  - *Best likeness*: Mosaica uses whichever photos match best, repeating them if needed.
    The main image comes out clearest.
  - *Never repeat a photo*: each photo appears only once.
- **Keep repeats apart**: copies of the same photo are kept at least this many tiles apart.
- **Main photo blended in**: lays the main photo lightly over the tiles. At 0 % you see only
  pure tiles; at 10–20 % the main image reads more clearly from a distance.
- **Tint tiles toward main photo**: gently shifts each tile's colour toward the spot it
  fills. It helps when the folder doesn't have the right colours, but it changes how the photos look.

The preview updates by itself as you change things. Click **Zoom in** at the top right to look
closely at the tiles, and **Fit to window** to go back.

**5 · Save**: choose **JPEG** (best for printing and sharing) or **PNG** (larger file,
no quality loss), then click **Save full-size file**. The file goes to your
**Downloads** folder, named after the main photo.

---

## 4. Printing

- The file is made at **300 dpi**, which is print quality. A letter mosaic prints at about 8.4 × 10.8 in,
  slightly smaller than the paper so every tile is a perfect square.
- In the print dialog, choose **Actual size** or **100 %**, not "Fit". On photo paper, use your
  printer's best photo quality.
- For a print shop, just give them the JPEG and tell them the paper size.

---

## 5. If something goes wrong

| What you see | What to do |
| --- | --- |
| "**N files could not be read**" | Those photos are probably still "cloud only" (see section 2), or the file is damaged. Click the line to see which ones. Download them, then click **Update** on that folder. |
| **Update** asks for permission | Normal: Chrome checks again after a restart. Click **Allow**. |
| Mosaica has **forgotten all my folders** | Chrome's *Clear browsing data* (or a clean-up program) deleted Mosaica's saved copies. Add the folders again. **Avoid clearing "cookies and site data"** for this site. |
| The main image doesn't come through | Raise *Tiles across*, choose *Best likeness*, or raise *Main photo blended in* a little. A folder with more varied colours also helps. |
| Photos are hard to recognise in the print | Lower *Tiles across*. |
| Large tiles look a little soft | Mosaica keeps small copies of each photo. They look sharp up to about 2 cm per tile in print, so stay above about 12 tiles across on letter paper. |
| The page won't open with no internet | It has to be opened once online first (section 1). Check that "Ready to work offline" appeared. |

---

## Your privacy

Everything happens on your laptop. Your photos, the mosaics and Mosaica's small photo copies never
leave it. Mosaica has no account, no tracking and no ads.
