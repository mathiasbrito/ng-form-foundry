import { AfterViewInit, Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';

/**
 * Reveals the full text in a Material tooltip only while the labelled element
 * is actually clipped by its ellipsis — a truncated "Add <field>" button reads
 * in full on hover or keyboard focus, while a label that fits stays quiet.
 * Pair with CSS that clips the measured element (`overflow: hidden;
 * text-overflow: ellipsis; white-space: nowrap`).
 *
 * Hosts {@link MatTooltip} and drives its `message` / `disabled` itself. The
 * clip state is tracked with a `ResizeObserver` and kept current as the
 * element's box changes, so it is already correct when the pointer arrives —
 * there is no show-time race with the tooltip's own pointer listeners.
 */
@Directive({
  selector: '[nffOverflowTooltip]',
  standalone: true,
  hostDirectives: [MatTooltip],
})
export class OverflowTooltipDirective implements AfterViewInit, OnDestroy {
  /** The full text to reveal when the measured element is clipped. */
  readonly text = input.required<string>({ alias: 'nffOverflowTooltip' });
  /**
   * Selector of the clipped element to measure, queried within the host; the
   * host element itself when unset. For a Material button point it at
   * `.mdc-button__label`, the wrapper that holds the text.
   */
  readonly forSelector = input<string | null>(null, { alias: 'nffOverflowTooltipFor' });

  private readonly tooltip = inject(MatTooltip);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private observer?: ResizeObserver;

  constructor() {
    // Keep the message in step with the label, and re-check the clip state — a
    // longer label can start overflowing without the box itself resizing.
    effect(() => {
      this.tooltip.message = this.text();
      this.sync();
    });
  }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.sync());
      this.observer.observe(this.measured());
    }
    this.sync();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  /** The element whose overflow decides the tooltip: the `forSelector` match, or the host. */
  private measured(): HTMLElement {
    const selector = this.forSelector();
    return (selector && this.host.nativeElement.querySelector<HTMLElement>(selector)) || this.host.nativeElement;
  }

  /** Enable the tooltip only while the measured element's content overflows its box. */
  private sync(): void {
    const el = this.measured();
    this.tooltip.disabled = el.scrollWidth - el.clientWidth <= 1;
  }
}
