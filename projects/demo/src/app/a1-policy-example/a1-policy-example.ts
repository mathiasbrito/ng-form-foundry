import { Component, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { JsonPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { buildFormFromSchema, DynamicRecursiveFormComponent, NodeGroup } from 'ng-form-foundry';
import { jsonSchemaToNodeGroup } from 'ng-form-foundry-transformers';
import { a1CommonSchema, a1QosTargetSchema } from './a1-policy-source';

// The exact flow the A1 console uses: a draft 2020-12 JSON Schema (with a
// cross-file `$ref` into the common document) → an ng-form-foundry schema. The
// transformer emits schema *data*, so it is cast to the library's `NodeGroup`.
const schema = jsonSchemaToNodeGroup(a1QosTargetSchema, 'a1QosTarget', {
  refDocuments: [a1CommonSchema],
}) as unknown as NodeGroup;

/**
 * Renders an A1 "QoS Target"-style policy form built at runtime from a JSON Schema
 * by {@link jsonSchemaToNodeGroup}, beside the source schema and the live value.
 * Verifies the consumer's asks end-to-end: constraint validators, the `anyOf`
 * `scope` as a choice, cross-file `$ref` resolution, and active-case inference
 * from seed data that carries no `__case`.
 */
@Component({
  selector: 'app-a1-policy-example',
  imports: [DynamicRecursiveFormComponent, JsonPipe, MatCardModule],
  templateUrl: './a1-policy-example.html',
  styleUrl: './a1-policy-example.scss',
})
export class A1PolicyExample {
  protected readonly schema = schema;
  protected readonly sourceJson = JSON.stringify(a1QosTargetSchema, null, 2);
  protected readonly form = buildFormFromSchema(schema, {
    scope: { sliceId: { sst: 1, sd: 'ABCDEF' }, qosId: { fiveQi: 9 } },
    qosObjectives: { gfbr: 1000, priorityLevel: 5 },
  });
  protected readonly value = signal<unknown>(this.form.getRawValue());

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.value.set(this.form.getRawValue()));
  }
}
