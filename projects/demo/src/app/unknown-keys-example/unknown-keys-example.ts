import { Component, computed, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { DynamicRecursiveFormComponent, NodeGroup, buildFormFromSchema, serializeForm } from 'ng-form-foundry';
import { libconfigTransformer } from 'ng-form-foundry-transformers/libconfig';
import type { JsonSchema } from 'ng-form-foundry-transformers';

type UnknownKeys = 'preserve' | 'drop' | 'edit';

/**
 * srsRAN-flavored fixture, written by hand for this demo. The partial schema
 * below covers only `pci`, `dl_arfcn`, and the (absent) `log_level` — every
 * other setting exists to show what each `unknownKeys` mode does with keys
 * the schema does not mention. `pci` is written in hex so the radix display
 * carries into `'edit'` mode.
 */
const SOURCE = `# gNB cell configuration
device_name = "gnb-lab-1";
pci = 0x1A;              // covered by the schema (hex literal)
dl_arfcn = 632628;       // covered by the schema
tx_gain = 30.5;          # NOT covered — float slot
band = 78;               # NOT covered
features = ( "mimo", "ca" );  # NOT covered — scalar list
amf = {
  addr = "10.0.0.1";     # NOT covered — nested group
  port = 38412;
};
`;

const PARTIAL_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['pci', 'dl_arfcn'],
  properties: {
    pci: { type: 'integer', title: 'PCI', minimum: 0, maximum: 1007 },
    dl_arfcn: { type: 'integer', title: 'DL ARFCN' },
    log_level: { type: 'string', title: 'Log level', enum: ['debug', 'info', 'warning', 'error'] },
  },
};

/**
 * Live demo of `unknownKeys` on the libconfig transformer: one hand-written
 * config, one partial JSON Schema, three answers to "what about the keys the
 * schema does not cover?". Switching mode re-runs `toSchema`; Save runs
 * `serializeForm` → `toSource` and shows the written file beside the
 * original. The ghost toggle previews the absent optional (`log_level`)
 * via the library's `showAbsentOptionals`.
 */
@Component({
  selector: 'app-unknown-keys-example',
  imports: [DynamicRecursiveFormComponent, MatButtonModule, MatButtonToggleModule, MatSlideToggleModule],
  templateUrl: './unknown-keys-example.html',
  styleUrl: './unknown-keys-example.scss',
})
export class UnknownKeysExample {
  readonly source = SOURCE;
  readonly mode = signal<UnknownKeys>('preserve');
  readonly ghosts = signal(false);
  readonly output = signal<string | null>(null);

  /** toSchema result for the current mode; a fresh form is built alongside. */
  private readonly transformed = computed(() => {
    const result = libconfigTransformer.toSchema(this.source, {
      schema: PARTIAL_SCHEMA,
      unknownKeys: this.mode(),
      rootName: 'Cell configuration',
    });
    // The transformer emits schema *data*; cast to the library's NodeGroup.
    const schema = result.schema as unknown as NodeGroup;
    return {
      schema,
      binding: result.binding,
      form: buildFormFromSchema(schema, result.initialValue) as FormGroup,
    };
  });

  readonly schema = computed(() => this.transformed().schema);
  readonly form = computed(() => this.transformed().form);
  readonly schemaJson = JSON.stringify(PARTIAL_SCHEMA, null, 2);

  setMode(mode: UnknownKeys): void {
    this.mode.set(mode);
    this.output.set(null);
  }

  save(): void {
    const { schema, binding, form } = this.transformed();
    this.output.set(
      libconfigTransformer.toSource(serializeForm(schema, form) as Record<string, unknown>, binding),
    );
  }

  readonly modeBlurb = computed(() => {
    switch (this.mode()) {
      case 'preserve':
        return 'The form shows only the schema-covered fields — PCI displaying as hex, the base the file wrote. On save, every uncovered setting survives byte-verbatim: comments, hex spelling, nested groups, all of it.';
      case 'drop':
        return 'The form shows only the schema-covered fields, and on save the value is authoritative for the whole document: every uncovered setting is deleted. For intentionally complete schemas.';
      case 'edit':
        return 'Uncovered settings render too, typed by the document’s own literals — note tx_gain as a float, the features list, the amf group. The whole document is editable.';
    }
  });
}
