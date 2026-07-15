import type { Transformer, TransformResult } from '../../core/transformer';
import type { FormValue } from '../../core/schema';
import type { YangEngine, CompileRequest } from './engine';
import type { EffectiveModel } from './model';
import { mapToSchema } from './mapper';
import { toYangData } from './revert';

/**
 * A YANG {@link Transformer} for the catalog: resolves a YANG source through an
 * engine into a form schema, and reverts the edited value to RFC 7951 data.
 *
 * This is the stateless, catalog-conformant view. For caching by `modelId`,
 * engine-side validation on write-back, and RFC 7951 → form-value conversion,
 * use the fuller {@link import('./adapter').YangFormAdapter} instead — both sit
 * on the same engine, {@link mapToSchema}, and {@link toYangData}.
 *
 * The `binding` it round-trips is the resolved {@link EffectiveModel}, which the
 * server keeps and never sends to the form UI.
 */
export function createYangTransformer(
  engine: YangEngine,
): Transformer<CompileRequest, Record<string, unknown>, EffectiveModel, void> {
  return {
    id: 'yang',

    async toSchema(source: CompileRequest): Promise<TransformResult<EffectiveModel>> {
      const binding = await engine.resolve(source);
      return { schema: mapToSchema(binding), binding };
    },

    toSource(value: FormValue, binding: EffectiveModel): Record<string, unknown> {
      return toYangData(value, binding);
    },
  };
}
