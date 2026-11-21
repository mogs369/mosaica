export interface SizePreset {
  id: string;
  label: string;
  /** Print size in inches (short side, long side). */
  inches?: [number, number];
  /** For screen output: long side in pixels; keeps the photo's shape. */
  longPx?: number;
  /** For "photo shape" prints: long side in inches; keeps the photo's shape. */
  longIn?: number;
}

export const DPI = 300;

export const PRESETS: SizePreset[] = [
  { id: 'letter', label: 'Letter print · 8.5 × 11 in', inches: [8.5, 11] },
  { id: '8x10', label: 'Print · 8 × 10 in', inches: [8, 10] },
  { id: 'a4', label: 'A4 print · 210 × 297 mm', inches: [8.27, 11.69] },
  { id: '5x7', label: 'Print · 5 × 7 in', inches: [5, 7] },
  { id: '4x6', label: 'Print · 4 × 6 in', inches: [4, 6] },
  { id: 'photo11', label: 'Print · photo shape, 11 in long side', longIn: 11 },
  { id: 'screen', label: 'Screen · photo shape, 2400 px', longPx: 2400 },
];

export interface Layout {
  cols: number;
  rows: number;
  /** Side of one tile in output pixels. */
  cell: number;
  outW: number;
  outH: number;
  /** Part of the main photo used (centre crop to the output shape). */
  crop: { sx: number; sy: number; sw: number; sh: number };
  /** Printed size in inches at DPI, or null for screen output. */
  printIn: [number, number] | null;
}

export function computeLayout(photoW: number, photoH: number, preset: SizePreset, tilesAcross: number): Layout {
  const portrait = photoH >= photoW;
  let targetW: number, targetH: number;
  if (preset.inches) {
    const [s, l] = preset.inches;
    targetW = Math.round((portrait ? s : l) * DPI);
    targetH = Math.round((portrait ? l : s) * DPI);
  } else {
    const long = preset.longPx ?? Math.round((preset.longIn ?? 11) * DPI);
    const k = long / Math.max(photoW, photoH);
    targetW = Math.round(photoW * k);
    targetH = Math.round(photoH * k);
  }
  const cols = Math.max(2, Math.round(tilesAcross));
  const cell = Math.max(1, Math.floor(targetW / cols));
  const rows = Math.max(1, preset.inches ? Math.floor(targetH / cell) : Math.round(targetH / cell));
  const outW = cols * cell, outH = rows * cell;

  // Centre-crop the main photo to the output shape.
  const want = outW / outH;
  let sw = photoW, sh = photoH;
  if (photoW / photoH > want) sw = photoH * want; else sh = photoW / want;
  const crop = { sx: (photoW - sw) / 2, sy: (photoH - sh) / 2, sw, sh };
  const printIn: [number, number] | null = preset.longPx ? null : [outW / DPI, outH / DPI];
  return { cols, rows, cell, outW, outH, crop, printIn };
}
