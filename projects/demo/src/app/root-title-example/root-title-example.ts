import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { buildFormFromSchema, ConfigEditorComponent, NodeGroup } from 'ng-form-foundry';

type RootVariant = 'sentinel' | 'labeled' | 'named';

/**
 * Playground for the tree editor's root-row title: switch the schema between a
 * transformer-style unnamed root (`__root__`, shown as "Configuration"), a
 * `__root__` carrying an authored label, and a plainly named root — and
 * optionally force a title through the `rootTitle` input, which wins over all
 * of them.
 */
@Component({
  selector: 'app-root-title-example',
  imports: [ConfigEditorComponent, FormsModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule],
  templateUrl: './root-title-example.html',
  styleUrl: './root-title-example.scss',
})
export class RootTitleExample {
  readonly variant = signal<RootVariant>('sentinel');
  /** `rootTitle` override; empty string = not set. */
  readonly titleOverride = signal('');

  readonly schema = computed<NodeGroup>(() => {
    const variant = this.variant();
    return {
      kind: 'nodeGroup',
      name: variant === 'named' ? 'device' : '__root__',
      ...(variant === 'labeled' ? { label: 'Device' } : {}),
      root: true,
      children: {
        hostname: { kind: 'leaf', type: 'string', name: 'hostname', label: 'Hostname', default: 'gw.example.net' },
        system: {
          kind: 'nodeGroup',
          name: 'system',
          label: 'System',
          children: {
            timezone: { kind: 'leaf', type: 'string', name: 'timezone', label: 'Timezone', default: 'UTC' },
            ntpServer: { kind: 'leaf', type: 'string', name: 'ntpServer', label: 'NTP server' },
          },
        },
      },
    };
  });

  readonly rootTitle = computed(() => this.titleOverride().trim() || undefined);

  // Same child shape in every variant, so one form serves all three schemas.
  readonly formGroup = buildFormFromSchema(this.schema());
}
