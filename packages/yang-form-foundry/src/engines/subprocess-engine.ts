import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { CompileRequest, ValidationResult, YangEngine } from '../engine';
import { EffectiveModel } from '../model';

export interface SubprocessEngineOptions {
  /** Python interpreter. Defaults to `python3`. */
  python?: string;
  /** Directory holding the bundled helper scripts. Defaults to the packaged `python/`. */
  scriptDir?: string;
  /** Extra `--path` entries passed to the resolver for imported modules. */
  yangPath?: string[];
}

/**
 * A {@link YangEngine} that resolves and validates by shelling out to the
 * bundled Python helpers, which wrap pyang/yangson (the maintained YANG
 * toolchain). Requires Python plus `pyang` and `yangson` on the host — ship them
 * in the deployment image, or run this behind a sidecar.
 *
 * `resolve` runs `emit_effective_tree.py` and parses its JSON as an
 * {@link EffectiveModel}. `validate` is a Phase-0 no-op: full RFC 7951 validation
 * with yangson needs the target's yang-library and is wired in a later phase.
 * Counterpart of `FakeEngine`, which serves canned models for tests.
 */
export class SubprocessEngine implements YangEngine {
  private readonly python: string;
  private readonly scriptDir: string;
  private readonly yangPath: string[];

  constructor(opts: SubprocessEngineOptions = {}) {
    this.python = opts.python ?? 'python3';
    this.scriptDir = opts.scriptDir ?? join(__dirname, '..', '..', 'python');
    this.yangPath = opts.yangPath ?? [];
  }

  async resolve(req: CompileRequest): Promise<EffectiveModel> {
    if (req.source.kind !== 'dir') {
      throw new Error('SubprocessEngine currently supports only { kind: "dir" } sources');
    }
    const args = [
      join(this.scriptDir, 'emit_effective_tree.py'),
      '--entry', req.entryModule,
      '--source', req.source.path,
      '--datastore', req.datastore ?? 'config',
      ...this.yangPath.flatMap((p) => ['--path', p]),
    ];
    const stdout = await this.run(args);
    return JSON.parse(stdout) as EffectiveModel;
  }

  async validate(_data: unknown, _model: EffectiveModel): Promise<ValidationResult> {
    // Phase 0: no-op. RFC 7951 validation via yangson requires the target's
    // yang-library and is wired in a later phase.
    return { valid: true, errors: [] };
  }

  private run(args: string[], stdin?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.python, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(out);
        else reject(new Error(`${this.python} exited ${code}: ${err.trim()}`));
      });
      if (stdin !== undefined) child.stdin.end(stdin);
      else child.stdin.end();
    });
  }
}
