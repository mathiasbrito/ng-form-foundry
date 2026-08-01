import { ComponentRef, Directive, ElementRef, effect, inject, input, NgZone, OnDestroy, TemplateRef } from '@angular/core';
import { ConnectedPosition, FlexibleConnectedPositionStrategy, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { RichTooltipPanelComponent } from './rich-tooltip-panel.component';

/**
 * Element-anchored placements, tried in order. The right side comes first — the
 * roomy side in a left-tree / right-detail layout — and CDK falls through to
 * below / above when it does not fit (e.g. a full-width breadcrumb, whose right
 * edge is already at the viewport edge), leaving the cramped left side as a
 * last resort.
 */
const POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 8 },
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -8 },
];

/**
 * Cursor-anchored placements: right of the pointer, falling back to its left
 * when near the right edge. Independent of the host's width — for a full-width
 * field, this keeps the popover by the cursor instead of dropping below it.
 */
const CURSOR_POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 16 },
  { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -16 },
];

/** How long the pointer must dwell before the popover opens / after it leaves before it closes (ms). */
const OPEN_DELAY = 120;
const CLOSE_DELAY = 150;

/**
 * A rich, HTML-capable help popover built on the CDK overlay — an alternative to
 * a plain-text `matTooltip` for content that needs formatting (lists, links,
 * `code`). Bind the host element to the HTML string:
 *
 * ```html
 * <button matIconButton [nffRichTooltip]="node.help" aria-label="Help">
 *   <mat-icon>help_outline</mat-icon>
 * </button>
 * ```
 *
 * Hovering or focusing the host opens the popover after a short delay; it stays
 * open while the pointer moves into the panel (so links and scrollable content
 * are reachable) and closes on leave, blur, or Escape. The content renders
 * through {@link RichTooltipPanelComponent}, which sanitizes it. An empty or
 * whitespace-only string keeps the popover suppressed, so a host can bind an
 * always-present trigger and let the text decide.
 */
@Directive({
  selector: '[nffRichTooltip], [nffRichTooltipTemplate]',
  standalone: true,
  host: {
    '(mouseenter)': 'onEnter($event)',
    '(mouseleave)': 'onLeave()',
    '(focus)': 'open()',
    '(blur)': 'scheduleClose()',
    '(keydown.escape)': 'close()',
  },
})
export class RichTooltipDirective implements OnDestroy {
  /** The HTML body content; the popover stays hidden while it is empty. */
  readonly html = input<string | null | undefined>(null, { alias: 'nffRichTooltip' });
  /** Optional popover title, shown above the body. */
  readonly title = input<string | null | undefined>(null, { alias: 'nffRichTooltipTitle' });
  /** Optional breadcrumb subtitle, shown under the title. */
  readonly subtitle = input<string | null | undefined>(null, { alias: 'nffRichTooltipSubtitle' });
  /**
   * Where the popover anchors: `'element'` (default) to the host's box —
   * consistent placement beside the trigger — or `'cursor'` to the pointer,
   * right of it, so a wide host (e.g. a full-width field) keeps the popover by
   * the cursor rather than dropping below.
   */
  readonly anchor = input<'element' | 'cursor'>('element', { alias: 'nffRichTooltipAnchor' });
  /** An `ng-template` rendered as the body (for interactive content like clickable links); wins over the HTML string. */
  readonly template = input<TemplateRef<unknown> | null>(null, { alias: 'nffRichTooltipTemplate' });
  /** Context object passed to {@link template}. */
  readonly templateContext = input<Record<string, unknown> | null>(null, { alias: 'nffRichTooltipContext' });

  private readonly overlay = inject(Overlay);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);

  private overlayRef?: OverlayRef;
  private positionStrategy?: FlexibleConnectedPositionStrategy;
  private panelRef?: ComponentRef<RichTooltipPanelComponent>;
  private openTimer?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;
  /** Latest pointer position, tracked only in `'cursor'` anchor mode. */
  private pointerX = 0;
  private pointerY = 0;

  constructor() {
    // Keep an open popover in step with changing inputs: update its content, or
    // close it outright when the body clears (e.g. help mode switched off while
    // the popover was showing).
    effect(() => {
      const hasBody = !!this.content() || !!this.template();
      // Read the rest so the open popover re-renders when any of them change.
      this.title();
      this.subtitle();
      this.templateContext();
      if (!this.panelRef) return;
      if (hasBody) this.write();
      else this.close();
    });

    // The anchor mode is baked into the overlay's position strategy at creation,
    // so drop the overlay when the mode changes — the next open rebuilds it.
    effect(() => {
      this.anchor();
      this.resetOverlay();
    });
  }

  /** Tear down the overlay so it is rebuilt (with the current anchor mode) on the next open. */
  private resetOverlay(): void {
    this.close();
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
    this.positionStrategy = undefined;
  }

  ngOnDestroy(): void {
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    this.host.nativeElement.removeEventListener('mousemove', this.onPointerMove);
    this.overlayRef?.dispose();
  }

  /** Record the entry point (cursor mode) and schedule the open. */
  protected onEnter(event: MouseEvent): void {
    if (this.anchor() === 'cursor') {
      this.pointerX = event.clientX;
      this.pointerY = event.clientY;
      // Track the pointer outside Angular so the popover anchors where it rests,
      // not where it crossed the edge — without a change-detection pass per move.
      this.zone.runOutsideAngular(() => this.host.nativeElement.addEventListener('mousemove', this.onPointerMove));
    }
    this.scheduleOpen();
  }

  /** Stop tracking the pointer and schedule the close. */
  protected onLeave(): void {
    this.host.nativeElement.removeEventListener('mousemove', this.onPointerMove);
    this.scheduleClose();
  }

  private readonly onPointerMove = (event: MouseEvent): void => {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
  };

  /** Show the popover now; a no-op when there is no body (HTML or template) to show. */
  open(): void {
    clearTimeout(this.closeTimer);
    if (!this.content() && !this.template()) return;
    const ref = this.ensureOverlay();
    // Cursor mode re-aims at the current pointer each time it opens.
    if (this.anchor() === 'cursor') this.positionStrategy?.setOrigin({ x: this.pointerX, y: this.pointerY });
    this.panelRef ??= ref.attach(new ComponentPortal(RichTooltipPanelComponent));
    this.write();
    ref.updatePosition();
  }

  /** Push the current title / subtitle / body (HTML or template) onto the open panel. */
  private write(): void {
    if (!this.panelRef) return;
    this.panelRef.setInput('title', (this.title() ?? '').trim());
    this.panelRef.setInput('subtitle', (this.subtitle() ?? '').trim());
    this.panelRef.setInput('body', this.content());
    this.panelRef.setInput('bodyTemplate', this.template());
    this.panelRef.setInput('bodyContext', this.templateContext());
  }

  /** Hide the popover. */
  close(): void {
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    if (this.overlayRef?.hasAttached()) this.overlayRef.detach();
    this.panelRef = undefined;
  }

  protected scheduleOpen(): void {
    clearTimeout(this.closeTimer);
    this.openTimer = setTimeout(() => this.open(), OPEN_DELAY);
  }

  protected scheduleClose(): void {
    clearTimeout(this.openTimer);
    this.closeTimer = setTimeout(() => this.close(), CLOSE_DELAY);
  }

  /** The trimmed HTML string, or empty when there is nothing to show. */
  private content(): string {
    return (this.html() ?? '').trim();
  }

  /** Lazily create the reusable overlay and wire the panel-hover keep-open. */
  private ensureOverlay(): OverlayRef {
    if (this.overlayRef) return this.overlayRef;
    const cursor = this.anchor() === 'cursor';
    this.positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(cursor ? { x: this.pointerX, y: this.pointerY } : this.host.nativeElement)
      .withPositions(cursor ? CURSOR_POSITIONS : POSITIONS)
      // Element mode honors the position order (fall through when one does not
      // fit); cursor mode nudges the popover on-screen so it stays by the pointer.
      .withPush(cursor);
    this.overlayRef = this.overlay.create({
      positionStrategy: this.positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: false,
    });
    const el = this.overlayRef.overlayElement;
    el.addEventListener('mouseenter', this.onPanelEnter);
    el.addEventListener('mouseleave', this.onPanelLeave);
    el.addEventListener('click', this.onPanelClick);
    return this.overlayRef;
  }

  private readonly onPanelEnter = (): void => clearTimeout(this.closeTimer);
  private readonly onPanelLeave = (): void => this.scheduleClose();
  /**
   * A click on an actionable element inside the popover (a link, or an error
   * "go to field" button) dismisses it — the user has acted and is heading back
   * to the keyboard, so the popover should not cover the field. Plain clicks
   * (selecting text) leave it open.
   */
  private readonly onPanelClick = (event: MouseEvent): void => {
    if ((event.target as Element | null)?.closest('a, button')) this.close();
  };
}
