import { base64, base64urlnopad, utf8 } from '@scure/base';

export const b64u = base64urlnopad;
export const b64 = base64;
export const utf8Encode = (s: string): Uint8Array => utf8.decode(s);
export const utf8Decode = (b: Uint8Array): string => utf8.encode(b);

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
