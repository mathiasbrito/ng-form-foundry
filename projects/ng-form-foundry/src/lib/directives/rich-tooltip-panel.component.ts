import { ChangeDetectionStrategy, Component, input, TemplateRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * The floating surface a {@link RichTooltipDirective} attaches into a CDK
 * overlay. Lays out an optional header — a `title` with a `subtitle` breadcrumb
 * beneath it — over the body. The body is either a `bodyTemplate` (an
 * `ng-template` supplied by the host, for interactive content like clickable
 * links) rendered with `bodyContext`, or, when no template is given, a `body`
 * HTML string rendered through Angular's `[innerHTML]` — sanitized (scripts and
 * unsafe attributes stripped) while formatting (lists, links, `code`, emphasis)
 * is kept. Title and subtitle are plain text. Internal to the directive; not
 * meant to be placed in a template directly.
 */
@Component({
  selector: 'nff-rich-tooltip-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
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
      @if (bodyTemplate(); as tmpl) {
        <div class="rt-body">
          <ng-container *ngTemplateOutlet="tmpl; context: bodyContext()"></ng-container>
        </div>
      } @else {
        <div class="rt-body" [innerHTML]="body()"></div>
      }
    </div>
  `,
  styleUrl: './rich-tooltip-panel.component.scss',
})
export class RichTooltipPanelComponent {
  /** Popover title — the field's name. */
  readonly title = input<string>('');
  /** Breadcrumb shown under the title — the field's location in the tree. */
  readonly subtitle = input<string>('');
  /** Sanitized HTML body, used when no {@link bodyTemplate} is provided. */
  readonly body = input<string>('');
  /** An `ng-template` for the body — for interactive content (e.g. clickable error links). Wins over `body`. */
  readonly bodyTemplate = input<TemplateRef<unknown> | null>(null);
  /** Context object passed to {@link bodyTemplate}. */
  readonly bodyContext = input<Record<string, unknown> | null>(null);
}
