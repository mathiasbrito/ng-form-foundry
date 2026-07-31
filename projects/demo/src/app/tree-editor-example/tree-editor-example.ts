import { Component, signal } from '@angular/core';
import { buildFormFromSchema, ConfigEditorComponent } from 'ng-form-foundry';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { treeEditorSchema } from './tree-editor-schema';

/**
 * The tree editor over a nested device config with several optional groups on
 * the root, plus a toggle wired to the editor's `optionalFields` input so the
 * two ways of offering absent optionals can be compared live: `'named'` (a
 * `+ <Field name>` row per optional) and `'menu'` (one `+ Optional field` row
 * whose menu holds them).
 */
@Component({
  selector: 'app-tree-editor-example',
  imports: [ConfigEditorComponent, MatButtonModule, MatButtonToggleModule],
  template: `
    <h2>Tree editor</h2>
    <p class="hint">
      This config leaves <code>Description</code>, <code>Logging</code>, <code>SNMP</code> and
      <code>Syslog</code> unset. Switch how the tree offers them: named rows name each field so an
      operator sees at a glance what can be added, while the single menu keeps the tree compact.
    </p>
    <mat-button-toggle-group
      class="mode-toggle"
      aria-label="Optional-field display"
      [value]="optionalMode()"
      (change)="optionalMode.set($event.value)"
    >
      <mat-button-toggle value="named">Named rows (default)</mat-button-toggle>
      <mat-button-toggle value="menu">Single menu</mat-button-toggle>
    </mat-button-toggle-group>
    <nff-config-editor [schema]="schema" [formGroup]="form" [optionalFields]="optionalMode()" />
    <button matButton (click)="print()">Print value to console</button>
  `,
  styles: `
    .hint {
      max-width: 60ch;
      color: var(--mat-sys-on-surface-variant);
    }
    .mode-toggle {
      margin-bottom: 16px;
    }
  `,
})
export class TreeEditorExample {
  protected readonly schema = treeEditorSchema;
  /** Which affordance the editor uses for absent optionals; bound to a toggle. */
  protected readonly optionalMode = signal<'named' | 'menu'>('named');
  protected readonly form = buildFormFromSchema(treeEditorSchema, {
    hostname: 'core-1',
    location: 'rack-3',
    system: { timezone: 'UTC', ntp: { server: 'pool.ntp.org', enabled: true } },
    interfaces: [
      { name: 'eth0', mtu: 1500, enabled: true },
      { name: 'eth1', mtu: 9000, enabled: false },
    ],
    // 'management' present; the other optionals omitted, so they surface as
    // add affordances the toggle above reshapes.
    management: { user: 'admin' },
  });

  print() {
    console.log(this.form.getRawValue());
  }
}
