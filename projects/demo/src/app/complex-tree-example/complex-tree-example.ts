import { Component } from '@angular/core';
import { buildFormFromSchema, ConfigEditorComponent } from 'ng-form-foundry';
import { MatButtonModule } from '@angular/material/button';
import { DUConfigSchema, sampleValue } from '../complex-form-example/complex-oai';

@Component({
  selector: 'app-complex-tree-example',
  imports: [ConfigEditorComponent, MatButtonModule],
  template: `
    <h2>Tree editor — OpenAirInterface 5G DU config</h2>
    <nff-config-editor [schema]="schema" [formGroup]="form" />
    <button matButton (click)="print()">Print value to console</button>
  `,
})
export class ComplexTreeExample {
  protected readonly schema = DUConfigSchema;
  protected readonly form = buildFormFromSchema(DUConfigSchema, sampleValue);

  print() {
    console.log(this.form.getRawValue());
  }
}
