import { Component } from '@angular/core';
import { buildFormFromSchema, DynamicRecursiveFormComponent } from 'ng-form-foundry';
import { MatButtonModule } from '@angular/material/button';
import { yangExample } from './yang-schema';

@Component({
  selector: 'app-yang-example',
  imports: [DynamicRecursiveFormComponent, MatButtonModule],
  template: `
    <h2>YANG-derived form — presence &amp; choice</h2>
    <nff-dynamic-recursive-form [schema]="schema" [formGroup]="form" [editable]="true" />
    <button matButton (click)="print()">Print value to console</button>
  `,
})
export class YangExample {
  protected readonly schema = yangExample;
  protected readonly form = buildFormFromSchema(yangExample, {
    hostname: 'router-1',
    transport: { __case: 'tcp', port: 8443, tls: true },
    ntp: { server: 'pool.ntp.org' },
  });

  print() {
    console.log(this.form.value);
  }
}
