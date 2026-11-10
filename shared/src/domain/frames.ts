import { FRAME_TYPE, FRAME_VERSION, MAX_FRAME_LENGTH } from '../contracts/frames';
import type { Frame, FrameType } from '../contracts/frames';
import { REFUSAL } from '../contracts/refusals';
import { Result } from '../shared/domain/Result';
import { canonicalJson } from './canonicalJson';



// Matches the 32-byte base64url value from IRandom.nonce(), with room for shorter codes.
const SESSION_CODE = /^[A-Za-z0-9_-]{16,64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

type Json = Record<string, unknown>;


export function isSessionCode(value: string): boolean {
  return SESSION_CODE.test(value);
}


// QR, copy code and Bluetooth all send this exact text, so a resent voucher is
// always byte-for-byte the one first shown.
export function encodeFrame(frame: Frame): string {
  const parts: string[] = [FRAME_VERSION, frame.type, toBase64Url(utf8Encode(canonicalJson(bodyOf(frame))))];
  if (frame.type === FRAME_TYPE.REQUEST && frame.sessionCode !== null) {
    if (!isSessionCode(frame.sessionCode)) {
      throw new Error('A session code must be 16 to 64 base64url characters');
    }
    parts.push(frame.sessionCode);
  }
  return parts.join(':');
}


// Checks only that the text is a well-formed T-Pay frame. Signatures and
// certificates are checked afterwards by issueVoucher and acceptVoucher.
export function decodeFrame(text: string): Result<Frame> {
  const frame = text.trim();
  if (frame.length === 0 || frame.length > MAX_FRAME_LENGTH) return invalid();

  const [version, type, body, sessionCode, ...rest] = frame.split(':');
  if (version !== FRAME_VERSION || !isFrameType(type) || body === undefined || rest.length > 0) {
    return invalid();
  }
  if (sessionCode !== undefined && (type !== FRAME_TYPE.REQUEST || !isSessionCode(sessionCode))) {
    return invalid();
  }

  const json = parseBody(body);
  if (!json) return invalid();

  const decoded = toFrame(type, json, sessionCode ?? null);
  return decoded ? Result.ok(decoded) : invalid();
}


function bodyOf(frame: Frame): object {
  switch (frame.type) {
    case FRAME_TYPE.REQUEST:
      return frame.request;
    case FRAME_TYPE.VOUCHER:
      return {
        voucher: frame.voucher,
        customerCertificate: frame.customerCertificate,
        vaultCertificate: frame.vaultCertificate,
      };
    case FRAME_TYPE.RECEIPT:
      return frame.receipt;
  }
}


function toFrame(type: FrameType, json: Json, sessionCode: string | null): Frame | null {
  switch (type) {
    case FRAME_TYPE.REQUEST:
      return isEnvelope(json) ? { type, request: json as never, sessionCode } : null;
    case FRAME_TYPE.RECEIPT:
      return isEnvelope(json) ? { type, receipt: json as never } : null;
    case FRAME_TYPE.VOUCHER: {
      const fields = ['customerCertificate', 'vaultCertificate', 'voucher'];
      if (!hasExactly(json, fields) || !fields.every((field) => isEnvelope(json[field]))) return null;
      return {
        type,
        voucher: json.voucher as never,
        customerCertificate: json.customerCertificate as never,
        vaultCertificate: json.vaultCertificate as never,
      };
    }
  }
}


function parseBody(body: string): Json | null {
  const bytes = fromBase64Url(body);
  const text = bytes && utf8Decode(bytes);
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}


function isFrameType(value: string | undefined): value is FrameType {
  return Object.values(FRAME_TYPE).includes(value as FrameType);
}


function isEnvelope(value: unknown): boolean {
  return isObject(value)
    && hasExactly(value, ['payload', 'signature'])
    && isObject(value.payload)
    && typeof value.signature === 'string'
    && value.signature.length > 0;
}


function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}


function hasExactly(value: Json, fields: string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every((field) => keys.includes(field));
}


function invalid(): Result<Frame> {
  return Result.fail(REFUSAL.INVALID_FRAME);
}


// shared/ has no dependencies and must run in Node and Hermes, so base64url and
// UTF-8 are done here rather than through Buffer or TextDecoder.
function toBase64Url(bytes: number[]): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const [a, b, c] = [bytes[index] as number, bytes[index + 1], bytes[index + 2]];
    const chunk = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    output += ALPHABET[(chunk >> 18) & 63] + (ALPHABET[(chunk >> 12) & 63] as string);
    if (b !== undefined) output += ALPHABET[(chunk >> 6) & 63];
    if (c !== undefined) output += ALPHABET[chunk & 63];
  }
  return output;
}


function fromBase64Url(text: string): number[] | null {
  if (!BASE64URL.test(text) || text.length % 4 === 1) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of text) {
    buffer = (buffer << 6) | ALPHABET.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  // Refuse spare bits that are not zero, so each frame has only one valid spelling.
  return toBase64Url(bytes) === text ? bytes : null;
}


function utf8Encode(text: string): number[] {
  const bytes: number[] = [];
  for (const character of text) {
    const point = character.codePointAt(0) as number;
    if (point < 0x80) {
      bytes.push(point);
    } else if (point < 0x800) {
      bytes.push(0xc0 | (point >> 6), 0x80 | (point & 63));
    } else if (point < 0x10000) {
      bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
    } else {
      bytes.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 63), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
    }
  }
  return bytes;
}


function utf8Decode(bytes: number[]): string | null {
  const points: number[] = [];
  for (let index = 0; index < bytes.length;) {
    const lead = bytes[index] as number;
    const length = lead < 0x80 ? 1 : lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 0;
    if (length === 0 || index + length > bytes.length) return null;
    let point = length === 1 ? lead : lead & (0xff >> (length + 1));
    for (let offset = 1; offset < length; offset += 1) {
      const next = bytes[index + offset] as number;
      if ((next & 0xc0) !== 0x80) return null;
      point = (point << 6) | (next & 63);
    }
    if (point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) return null;
    points.push(point);
    index += length;
  }
  const text = String.fromCodePoint(...points);
  // Overlong and other non-shortest forms do not survive a round trip.
  const again = utf8Encode(text);
  return again.length === bytes.length && again.every((byte, index) => byte === bytes[index]) ? text : null;
}
