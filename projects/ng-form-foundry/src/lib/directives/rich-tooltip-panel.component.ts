import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The floating surface a {@link RichTooltipDirective} attaches into a CDK
 * overlay. Lays out an optional header — a `title` with a `subtitle` breadcrumb
 * beneath it — over a `body` rendered through Angular's `[innerHTML]`, so the
 * body is sanitized (scripts and unsafe attributes stripped) while formatting —
 * lists, links, `code`, emphasis — is kept. Title and subtitle are plain text.
 * Internal to the directive; not meant to be placed in a template directly.
 */
@Component({
  selector: 'nff-rich-tooltip-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nff-rich-tooltip" role="tooltip">
      @if (title() || subtitle()) {
        <div class="rt-header">
          @if (title()) {
            <div class="rt-title">{{ title() }}</div>
          }
          @if (subtitle()) {
            <div class="rt-subtitle">{{ subtitle() }}</div>
          }
        </div>
      }
      <div class="rt-body" [innerHTML]="body()"></div>
    </div>
  `,
  styleUrl: './rich-tooltip-panel.component.scss',
})
export class RichTooltipPanelComponent {
  /** Popover title — the field's name. */
  readonly title = input<string>('');
  /** Breadcrumb shown under the title — the field's location in the tree. */
  readonly subtitle = input<string>('');
  /** Sanitized HTML help content shown in the body. */
  readonly body = input<string>('');
}
