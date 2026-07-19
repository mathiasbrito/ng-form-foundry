import { Appearance } from '../types/dynamic-recursive.types';

/**
 * The field-layout subset of an `Appearance` that descendants inherit
 * (`grid`, `minFieldWidth`, `booleanFields`, `minTextFieldWidth`,
 * `minNumberFieldWidth`, `maxNumberFieldWidth`). Chrome flags — `flatten`,
 * `noBorder`, `collapsed` —
 * describe the node's own frame and never cascade. Null when nothing is
 * inheritable. Counterpart of {@link mergeAppearance}.
 */
export function inheritableAppearance(appearance: Appearance | null | undefined): Appearance | null {
  if (!appearance) return null;
  const out: Appearance = {};
  if (appearance.grid != null) out.grid = appearance.grid;
  if (appearance.minFieldWidth != null) out.minFieldWidth = appearance.minFieldWidth;
  if (appearance.booleanFields != null) out.booleanFields = appearance.booleanFields;
  if (appearance.minTextFieldWidth != null) out.minTextFieldWidth = appearance.minTextFieldWidth;
  if (appearance.minNumberFieldWidth != null) out.minNumberFieldWidth = appearance.minNumberFieldWidth;
  if (appearance.maxNumberFieldWidth != null) out.maxNumberFieldWidth = appearance.maxNumberFieldWidth;
  return Object.keys(out).length ? out : null;
}

/**
 * A node's effective appearance: its own settings win, layout gaps fall back
 * to `inherited` per property. The `grid`/`minFieldWidth` pair is treated as
 * one decision — a node that sets either has chosen its field sizing, so
 * neither is inherited (otherwise an inherited `grid` would override the
 * node's own `minFieldWidth` by the grid-wins precedence).
 */
export function mergeAppearance(
  inherited: Appearance | null | undefined,
  own: Appearance | undefined,
): Appearance | undefined {
  if (!inherited) return own;
  const merged: Appearance = { ...own };
  if (own?.grid == null && own?.minFieldWidth == null) {
    if (inherited.grid != null) merged.grid = inherited.grid;
    if (inherited.minFieldWidth != null) merged.minFieldWidth = inherited.minFieldWidth;
  }
  if (merged.booleanFields == null && inherited.booleanFields != null) merged.booleanFields = inherited.booleanFields;
  if (merged.minTextFieldWidth == null && inherited.minTextFieldWidth != null) {
    merged.minTextFieldWidth = inherited.minTextFieldWidth;
  }
  if (merged.minNumberFieldWidth == null && inherited.minNumberFieldWidth != null) {
    merged.minNumberFieldWidth = inherited.minNumberFieldWidth;
  }
  if (merged.maxNumberFieldWidth == null && inherited.maxNumberFieldWidth != null) {
    merged.maxNumberFieldWidth = inherited.maxNumberFieldWidth;
  }
  return merged;
}
