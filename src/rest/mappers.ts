/**
 * Predefined `replyMapper` implementations for common content types.
 *
 * Pass one of these as the `replyMapper` prop, or let `registerCommon`
 * apply them automatically (json is the default unless the Content-Type
 * header indicates a `text/*` response).
 */

/** Cast the already-parsed JSON object to R. */
export const jsonReplyMapper = <R>(
  raw: unknown,
  _headers: { [k: string]: string },
): Promise<R> => Promise.resolve(raw as R);

/** Cast a plain-text string response to string. Only valid when R = string. */
export const textReplyMapper = (
  raw: unknown,
  _headers: { [k: string]: string },
): Promise<string> => Promise.resolve(String(raw));
