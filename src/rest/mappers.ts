/**
 * Predefined `replyMapper` implementations for common content types.
 *
 * Pass one of these as the `replyMapper` prop, or let `registerCommon`
 * apply them automatically (json is the default unless the Content-Type
 * header indicates a `text/*` response).
 */

/**
 * Resolve any raw value to a plain string, handling Blob asynchronously.
 * Used internally by both predefined mappers.
 */
const toText = (v: unknown): Promise<string> =>
  v instanceof Blob ? v.text() : Promise.resolve(String(v));

/**
 * Default mapper for JSON / object responses.
 *
 * - Already-parsed object (most common): returned as-is.
 * - String: parsed via `JSON.parse`.
 * - Blob: read as UTF-8 text first, then parsed via `JSON.parse`.
 */
export const jsonReplyMapper = async <R>(
  raw: unknown,
  _headers: { [k: string]: string },
): Promise<R> => {
  if (raw instanceof Blob || typeof raw === "string") {
    const text = await toText(raw);
    return JSON.parse(text) as R;
  }
  return raw as R;
};

/**
 * Default mapper for `text/*` responses.
 *
 * - String: returned as-is.
 * - Blob: read as UTF-8 text via `blob.text()`.
 * - Anything else: coerced with `String(raw)`.
 *
 * Only valid when the REST registration's `R` type is `string`.
 */
export const textReplyMapper = (
  raw: unknown,
  _headers: { [k: string]: string },
): Promise<string> => toText(raw);
