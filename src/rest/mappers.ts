/**
 * Predefined `replyMapper` implementations for common content types.
 *
 * Pass one of these as the `replyMapper` prop, or let `registerCommon`
 * apply them automatically (json is the default unless the Content-Type
 * header indicates a `text/*` response).
 */

import type { HttpResponse } from "./types";

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
export const jsonReplyMapper = async <R>({ content }: HttpResponse): Promise<R> => {
  if (content instanceof Blob || typeof content === "string") {
    const text = await toText(content);
    return JSON.parse(text) as R;
  }
  return content as R;
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
export const textReplyMapper = ({ content }: HttpResponse): Promise<string> =>
  toText(content);

/**
 * A minimal structural type that matches any Zod schema (and anything else
 * that exposes a `parse(data: unknown): T` method — e.g. custom validators).
 * Avoids a hard runtime dependency on the `zod` package.
 */
interface ParseableSchema<T> {
  parse(data: unknown): T;
}

/**
 * Factory that returns a `replyMapper` which validates `r.content` against
 * a Zod schema (or any object with a `parse` method).
 *
 * Throws a `ZodError` on validation failure, which the REST layer catches and
 * converts into an error action with `statusCode: 0`.
 *
 * @example
 * ```ts
 * import { z } from "zod"
 * import { zodReplyMapper } from "@pihanga2/core/rest"
 *
 * const PredictionSchema = z.object({
 *   input_text: z.string(),
 *   probabilities: z.array(z.number()).nonempty(),
 * })
 *
 * registerGET<AppState, LoadAction, z.infer<typeof PredictionSchema>>({
 *   // …
 *   replyMapper: zodReplyMapper(PredictionSchema),
 * })
 * ```
 */
export const zodReplyMapper =
  <T>(schema: ParseableSchema<T>) =>
  ({ content }: HttpResponse): Promise<T> =>
    Promise.resolve(schema.parse(content));
