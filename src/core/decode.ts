// Turns any supported image file into an ImageBitmap, including iPhone HEIC
// files (which browsers on Windows cannot read on their own).

const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avci'];

export const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?)$/i;

async function isHeic(file: Blob, name: string): Promise<boolean> {
  if (/\.(heic|heif)$/i.test(name)) return true;
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head[4] !== 0x66 || head[5] !== 0x74 || head[6] !== 0x79 || head[7] !== 0x70) return false; // 'ftyp'
  const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
  return HEIC_BRANDS.includes(brand);
}

type HeifLib = { HeifDecoder: new () => { decode(buf: ArrayBuffer | Uint8Array): HeifImage[] } };
type HeifImage = {
  get_width(): number;
  get_height(): number;
  display(img: { data: Uint8ClampedArray; width: number; height: number }, cb: (r: unknown) => void): void;
  free(): void;
};

let heif: Promise<HeifLib> | null = null;
function loadHeif(): Promise<HeifLib> {
  heif ??= import('libheif-js/libheif-wasm/libheif-bundle.mjs').then((m) => (m.default as () => HeifLib)());
  return heif;
}

async function decodeHeic(file: Blob): Promise<ImageBitmap> {
  const lib = await loadHeif();
  const decoder = new lib.HeifDecoder();
  const images = decoder.decode(new Uint8Array(await file.arrayBuffer()));
  if (!images.length) throw new Error('HEIC file has no image');
  const img = images[0];
  const width = img.get_width(), height = img.get_height();
  const data = new Uint8ClampedArray(width * height * 4);
  await new Promise<void>((resolve, reject) => {
    img.display({ data, width, height }, (r) => (r ? resolve() : reject(new Error('HEIC decode failed'))));
  });
  for (const i of images) i.free();
  return createImageBitmap(new ImageData(data, width, height));
}

export async function decodeImage(file: Blob, name: string): Promise<ImageBitmap> {
  if (await isHeic(file, name)) return decodeHeic(file);
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}
