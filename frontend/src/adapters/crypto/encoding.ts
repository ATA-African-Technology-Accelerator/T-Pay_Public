// Byte formats the backend expects: base64url text, raw r‖s signatures, uncompressed public keys.
import { p256 } from '@noble/curves/nist.js';

const CURVE_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const COORDINATE_BYTES = 32;
const UNCOMPRESSED_POINT_BYTES = 65;
// DER header of a P-256 SubjectPublicKeyInfo; the 65-byte point follows it.
const P256_SPKI_PREFIX = '3059301306072a8648ce3d020106082a8648ce3d030107034200';

export function base64ToBytes(base64: string): Uint8Array {
  const text = atob(base64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(text, ch => ch.charCodeAt(0));
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let text = '';
  bytes.forEach(b => { text += String.fromCharCode(b); });
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** Android returns X.509 SubjectPublicKeyInfo; the backend wants the bare 65-byte point. */
export function spkiToRawPublicKey(spkiBase64: string): Uint8Array {
  const der = base64ToBytes(spkiBase64);
  const prefixBytes = P256_SPKI_PREFIX.length / 2;
  if (der.length !== prefixBytes + UNCOMPRESSED_POINT_BYTES || hex(der.subarray(0, prefixBytes)) !== P256_SPKI_PREFIX) {
    throw new Error('Keystore returned a key that is not P-256');
  }
  return der.subarray(prefixBytes);
}

/** Android signs in DER with any S; the backend wants 64-byte r‖s with low S. */
export function derToLowSCompact(derBase64: string): Uint8Array {
  const sig = p256.Signature.fromBytes(base64ToBytes(derBase64), 'der');
  const s = sig.s > CURVE_ORDER / 2n ? CURVE_ORDER - sig.s : sig.s;
  return concat(toBytes32(sig.r), toBytes32(s));
}

function toBytes32(n: bigint): Uint8Array {
  const out = new Uint8Array(COORDINATE_BYTES);
  for (let i = COORDINATE_BYTES - 1, v = n; i >= 0; i--, v >>= 8n) out[i] = Number(v & 0xffn);
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
