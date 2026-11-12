// T-Pay's own QR reader. The camera's live scanner uses the phone's built-in reader (Google ML Kit),
// which some phones lack or run badly, and which can miss a dense payment code on a weak camera.
// This one is plain JavaScript, so it works on every phone: the scanner takes a still photo every
// moment or two and reads the code here when the built-in reader hasn't.
import jsQR from 'jsqr';
import { decode } from 'jpeg-js';
import { base64ToBytes } from '../../adapters/crypto/encoding';

// Big enough to read the densest payment code, small enough to read in a moment on a cheap phone.
const MAX_SIDE = 1600;

/** The text in the QR code in this JPEG photo (base64), or null when there is none. */
export function readQrFromJpeg(base64: string): string | null {
  let image: { width: number; height: number; data: Uint8Array };
  try {
    image = decode(base64ToBytes(base64), { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 24, maxMemoryUsageInMB: 256 });
  } catch {
    return null;
  }
  const { width, height, data } = shrink(image);
  const found = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width, height, { inversionAttempts: 'attemptBoth' });
  return found?.data ? found.data : null;
}

/** Keeps every nth pixel when the photo is larger than it needs to be. */
function shrink(image: { width: number; height: number; data: Uint8Array }): { width: number; height: number; data: Uint8Array } {
  const step = Math.ceil(Math.max(image.width, image.height) / MAX_SIDE);
  if (step <= 1) return image;
  const width = Math.floor(image.width / step);
  const height = Math.floor(image.height / step);
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = ((y * step) * image.width + x * step) * 4;
      const to = (y * width + x) * 4;
      out[to] = image.data[from] as number;
      out[to + 1] = image.data[from + 1] as number;
      out[to + 2] = image.data[from + 2] as number;
      out[to + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/** The picture size to ask the camera for: the smallest at least 1280 wide, or the largest there is. */
export function pickPictureSize(sizes: string[]): string | undefined {
  const parsed = sizes
    .map(size => { const [w, h] = size.split('x').map(Number); return { size, long: Math.max(w ?? 0, h ?? 0) }; })
    .filter(s => s.long > 0)
    .sort((a, b) => a.long - b.long);
  return (parsed.find(s => s.long >= 1280 && s.long <= 2000) ?? parsed[parsed.length - 1])?.size;
}
