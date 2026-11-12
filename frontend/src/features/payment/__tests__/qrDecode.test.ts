/// <reference types="jest" />
// The app's own QR reader, for phones whose built-in reader is missing or misses the code.
// The QR maker the app already uses to show codes (through react-native-qrcode-svg).
const QRCode = require('qrcode') as { create(text: string, o: object): { modules: { size: number; get(r: number, c: number): number } } };
import { encode } from 'jpeg-js';
import { pickPictureSize, readQrFromJpeg } from '../qrDecode';

/** A camera-like photo of a QR code: dark modules on white, with a margin, saved as JPEG. */
function photoOf(text: string, pixelsPerModule: number, width: number, height: number): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = Buffer.alloc(width * height * 4, 255);
  const left = Math.floor((width - size * pixelsPerModule) / 2);
  const top = Math.floor((height - size * pixelsPerModule) / 2);
  for (let y = 0; y < size * pixelsPerModule; y += 1) {
    for (let x = 0; x < size * pixelsPerModule; x += 1) {
      if (!qr.modules.get(Math.floor(y / pixelsPerModule), Math.floor(x / pixelsPerModule))) continue;
      const i = ((top + y) * width + left + x) * 4;
      data[i] = 30; data[i + 1] = 30; data[i + 2] = 30;
    }
  }
  return Buffer.from(encode({ data, width, height }, 80).data).toString('base64');
}

describe('reading a QR code from a photo', () => {
  it('reads a long payment code', () => {
    const frame = `T1:VOUCHER:${'eyJhbW91bnQiOjIwMDAwMH0'.repeat(40)}`;
    expect(readQrFromJpeg(photoOf(frame, 6, 1280, 960))).toBe(frame);
  });

  it('reads a code near the largest a QR can hold, at four pixels a square', () => {
    const frame = `T1:VOUCHER:${'eyJ2YXVsdElkIjoiMTIzNDU2Nzg5MCJ9'.repeat(60)}`.slice(0, 2000);
    expect(readQrFromJpeg(photoOf(frame, 4, 1280, 960))).toBe(frame);
  });

  it('reads a large photo, shrunk first', () => {
    const frame = 'T1:REQUEST:abc123';
    expect(readQrFromJpeg(photoOf(frame, 24, 3200, 2400))).toBe(frame);
  });

  it('says null for a photo with no code, or a broken file', () => {
    const blank = Buffer.from(encode({ data: Buffer.alloc(640 * 480 * 4, 200), width: 640, height: 480 }, 80).data).toString('base64');
    expect(readQrFromJpeg(blank)).toBeNull();
    expect(readQrFromJpeg('bm90IGEganBlZw==')).toBeNull();
  });

  it('asks the camera for a size that is sharp enough but quick to read', () => {
    expect(pickPictureSize(['640x480', '1280x720', '1920x1080', '4000x3000'])).toBe('1280x720');
    expect(pickPictureSize(['640x480', '800x600'])).toBe('800x600');
    expect(pickPictureSize([])).toBeUndefined();
  });
});
