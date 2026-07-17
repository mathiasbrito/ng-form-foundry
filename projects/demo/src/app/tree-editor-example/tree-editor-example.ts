import { Component } from '@angular/core';
import { buildFormFromSchema, ConfigEditorComponent } from 'ng-form-foundry';
import { MatButtonModule } from '@angular/material/button';
import { treeEditorSchema } from './tree-editor-schema';

@Component({
  selector: 'app-tree-editor-example',
  imports: [ConfigEditorComponent, MatButtonModule],
  template: `
    <h2>Tree editor</h2>
    <nff-config-editor [schema]="schema" [formGroup]="form" />
    <button matButton (click)="print()">Print value to console</button>
  `,
})
export class TreeEditorExample {
  protected readonly schema = treeEditorSchema;
  protected readonly form = buildFormFromSchema(treeEditorSchema, {
    hostname: 'core-1',
    location: 'rack-3',
    system: { timezone: 'UTC', ntp: { server: 'pool.ntp.org', enabled: true } },
    interfaces: [
      { name: 'eth0', mtu: 1500, enabled: true },
      { name: 'eth1', mtu: 9000, enabled: false },
    ],
    // 'management' present; 'logging' omitted (offered by the "+ Optional field" menu).
    management: { user: 'admin' },
  });

  print() {
    console.log(this.form.getRawValue());
  }
}
