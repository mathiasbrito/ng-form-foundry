import { Appearance } from '../types/dynamic-recursive.types';

/**
 * Inline CSS declarations (property → value) for a node's `.fields` area,
 * derived from its {@link Appearance} (see the form component's
 * `fieldsLayout`) and bound via `[style]`. Also handed to a stacked
 * leaf-list's `layout` input so its entries repeat the same grid tracks.
 */
export type LayoutStyles = Record<string, string>;

/**
 * The field-layout subset of an {@link Appearance} — the properties
 * descendants inherit, in output order. Chrome flags — `flatten`, `noBorder`,
 * `collapsed` — describe the node's own frame and never cascade.
 */
const INHERITED_LAYOUT_KEYS = [
  'grid',
  'minFieldWidth',
  'booleanFields',
  'minTextFieldWidth',
  'minNumberFieldWidth',
  'maxNumberFieldWidth',
] as const satisfies readonly (keyof Appearance)[];

/**
 * `grid` and `minFieldWidth` form one field-sizing decision: a node that sets
 * either has chosen its sizing, so neither is inherited (otherwise an
 * inherited `grid` would override the node's own `minFieldWidth` by the
 * grid-wins precedence). See {@link mergeAppearance}.
 */
const FIELD_SIZING_KEYS: ReadonlySet<keyof Appearance> = new Set(['grid', 'minFieldWidth']);

/** `to[key] = value` keyed generically — the key–value correlation TypeScript cannot track for a union-typed key. */
function assign<K extends keyof Appearance>(to: Appearance, key: K, value: Appearance[K]): void {
  to[key] = value;
}

/**
 * The subset of an `Appearance` that descendants inherit
 * ({@link INHERITED_LAYOUT_KEYS}). Null when nothing is inheritable.
 * Counterpart of {@link mergeAppearance}.
 */
export function inheritableAppearance(appearance: Appearance | null | undefined): Appearance | null {
  if (!appearance) return null;
  const out: Appearance = {};
  for (const key of INHERITED_LAYOUT_KEYS) {
    if (appearance[key] != null) assign(out, key, appearance[key]);
  }
  return Object.keys(out).length ? out : null;
}

/**
 * A node's effective appearance: its own settings win, layout gaps fall back
 * to `inherited` per property — except the {@link FIELD_SIZING_KEYS} pair,
 * which is only inherited as a whole when the node sets neither.
 */
export function mergeAppearance(
  inherited: Appearance | null | undefined,
  own: Appearance | undefined,
): Appearance | undefined {
  if (!inherited) return own;
  const merged: Appearance = { ...own };
  const ownFieldSizing = own?.grid != null || own?.minFieldWidth != null;
  for (const key of INHERITED_LAYOUT_KEYS) {
    if (ownFieldSizing && FIELD_SIZING_KEYS.has(key)) continue;
    if (merged[key] == null && inherited[key] != null) assign(merged, key, inherited[key]);
  }
  return merged;
}

/**
 * The layout a node's descendants inherit: the layout cascading down from its
 * ancestors with the node's own `appearance` merged over it
 * ({@link mergeAppearance}), reduced to the inheritable subset
 * ({@link inheritableAppearance}).
 */
export function descendantLayout(
  inherited: Appearance | null | undefined,
  own: Appearance | undefined,
): Appearance | null {
  return inheritableAppearance(mergeAppearance(inherited, own));
}
