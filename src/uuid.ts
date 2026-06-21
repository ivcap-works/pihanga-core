/**
 * Minimal UUIDv7 generator.
 *
 * - Uses current Unix epoch milliseconds.
 * - Uses `crypto.getRandomValues` when available (browser + modern runtimes).
 * - Falls back to `Math.random` as a last resort.
 *
 * Spec reference: https://www.rfc-editor.org/rfc/rfc9562
 */

function getRandomBytes(len: number): Uint8Array {
  const a = new Uint8Array(len);

  // Browser / modern Node
  const g = globalThis as any;
  if (g?.crypto?.getRandomValues) {
    g.crypto.getRandomValues(a);
    return a;
  }

  // Last resort: not cryptographically secure.
  for (let i = 0; i < len; i++) {
    a[i] = Math.floor(Math.random() * 256);
  }
  return a;
}

function toHex(b: number): string {
  return b.toString(16).padStart(2, "0");
}

/**
 * Generate a RFC 9562 UUIDv7 string.
 */
export function uuidv7(): string {
  const nowMs = Date.now();
  const bytes = getRandomBytes(16);

  // time_high (48 bits) in bytes[0..5]
  // JavaScript bitwise operators truncate to 32-bit integers, so we can't use
  // >>> for shifts above 31 bits. Instead, split into high 16 and low 32 bits.
  const hi = Math.floor(nowMs / 0x100000000); // bits 32–47 of the timestamp
  const lo = nowMs >>> 0; // bits 0–31 of the timestamp

  bytes[0] = (hi >>> 8) & 0xff;
  bytes[1] = hi & 0xff;
  bytes[2] = (lo >>> 24) & 0xff;
  bytes[3] = (lo >>> 16) & 0xff;
  bytes[4] = (lo >>> 8) & 0xff;
  bytes[5] = lo & 0xff;

  // version (7) in high nibble of byte 6
  bytes[6] = (bytes[6] & 0x0f) | 0x70;

  // variant (RFC 4122) in byte 8
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  // Format: 8-4-4-4-12
  const hex = Array.from(bytes, toHex).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
