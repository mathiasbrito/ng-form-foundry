import { Component, signal } from '@angular/core';
import { buildFormFromSchema, ConfigEditorComponent } from 'ng-form-foundry';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { richHelpSchema } from './rich-help-schema';

/**
 * The tree editor over a schema whose nodes and fields carry rich-HTML
 * `description`s: with help mode on, hovering a tree row, a breadcrumb crumb, or
 * a field opens a formatted help popover. A toggle switches how field popovers
 * anchor — to the pointer or to the field's box — so the two can be compared.
 */
@Component({
  selector: 'app-rich-help-example',
  imports: [ConfigEditorComponent, MatButtonModule, MatButtonToggleModule],
  template: `
    <h2>Tree editor — rich help popovers</h2>
    <p class="hint">
      Every group, list, map, choice <em>and field</em> here has an HTML <code>description</code>. Click the
      <strong>help</strong> toggle in the root row (next to the edit pencil) to turn help mode on; then just
      hovering — or keyboard-focusing — any documented row, breadcrumb, or field opens a formatted popover.
      Toggle help off for a clutter-free tree.
    </p>
    <p class="hint">
      <strong>Field help anchor:</strong> compare how a field's popover is placed — by the pointer
      (steady on full-width fields) or by the field's box (can drop below it).
    </p>
    <mat-button-toggle-group
      class="anchor-toggle"
      aria-label="Field help anchor"
      [value]="fieldAnchor()"
      (change)="fieldAnchor.set($event.value)"
    >
      <mat-button-toggle value="cursor">Anchor to cursor (default)</mat-button-toggle>
      <mat-button-toggle value="element">Anchor to field</mat-button-toggle>
    </mat-button-toggle-group>
    <nff-config-editor
      [schema]="schema"
      [formGroup]="form"
      [initiallyExpanded]="true"
      [fieldHelpAnchor]="fieldAnchor()"
    />
    <button matButton (click)="print()">Print value to console</button>
  `,
  styles: `
    .hint {
      max-width: 66ch;
      color: var(--mat-sys-on-surface-variant);
    }
    .anchor-toggle {
      margin-bottom: 16px;
    }
  `,
})
export class RichHelpExample {
  protected readonly schema = richHelpSchema;
  /** Which anchor the config editor uses for field help popovers; bound to a toggle. */
  protected readonly fieldAnchor = signal<'element' | 'cursor'>('cursor');
  protected readonly form = buildFormFromSchema(richHelpSchema, {
    hostname: 'core-1',
    system: { timezone: 'Europe/Berlin', ntp: { server: 'pool.ntp.org', enabled: true } },
    interfaces: [{ name: 'eth0', mtu: 1500, enabled: true }],
    routes: { '10.0.0.0/8': '192.168.1.1' },
    auth: { key: { publicKey: 'ssh-ed25519 AAAA...' } },
  });

  print() {
    console.log(this.form.getRawValue());
  }
}
