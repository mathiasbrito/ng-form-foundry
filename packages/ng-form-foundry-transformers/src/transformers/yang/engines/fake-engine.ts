import { CompileRequest, ValidationResult, YangEngine } from '../engine';
import { EffectiveModel } from '../model';

/**
 * A {@link YangEngine} backed by pre-resolved effective models, keyed by entry
 * module name. Used in tests and for local development so the adapter runs
 * without a Python toolchain. An optional `validator` lets a test assert the
 * validation branch; by default validation always passes.
 */
export class FakeEngine implements YangEngine {
  constructor(
    private readonly models: Record<string, EffectiveModel>,
    private readonly validator?: (data: unknown, model: EffectiveModel) => ValidationResult,
  ) {}

  async resolve(req: CompileRequest): Promise<EffectiveModel> {
    const model = this.models[req.entryModule];
    if (!model) {
      throw new Error(`FakeEngine has no effective model for entry module '${req.entryModule}'`);
    }
    return model;
  }

  async validate(data: unknown, model: EffectiveModel): Promise<ValidationResult> {
    return this.validator ? this.validator(data, model) : { valid: true, errors: [] };
  }
}
