/**
 * Big-integer handling shared by the data transformers.
 *
 * JSON and YAML both write integers as bare numeric literals, but a JavaScript
 * `number` only holds integers up to 2^53 − 1 exactly — parse `9007199254740993`
 * and you get `…992` back. To avoid silently corrupting such values, the
 * transformers carry any out-of-range integer as a **string** in the form value
 * (the same strategy the YANG adapter uses for `int64`/`uint64`/`decimal64`) and
 * re-emit it verbatim as an unquoted number. These helpers are the shared
 * predicates for that path.
 */

/** Largest integer a `number` represents exactly (2^53 − 1), as a BigInt. */
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** A string that is a base-10 integer literal (optionally signed), safe or not. */
export function isIntegerString(s: string): boolean {
  return /^-?\d+$/.test(s);
}

/** A BigInt whose magnitude exceeds the safe range, so a `number` can't hold it. */
export function isUnsafeBigInt(b: bigint): boolean {
  return (b < 0n ? -b : b) > MAX_SAFE;
}

/** An integer literal whose magnitude a `number` can't hold without loss. */
export function isUnsafeIntegerString(s: string): boolean {
  return isIntegerString(s) && isUnsafeBigInt(BigInt(s));
}
