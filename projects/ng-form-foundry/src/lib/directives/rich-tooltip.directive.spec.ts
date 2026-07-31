import { ApplicationRef, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';

import { RichTooltipDirective } from './rich-tooltip.directive';

@Component({
  standalone: true,
  imports: [RichTooltipDirective],
  template: `<button [nffRichTooltip]="html" [nffRichTooltipTitle]="title" [nffRichTooltipSubtitle]="subtitle">?</button>`,
})
class HostComponent {
  html: string | null = '<p>Root <strong>help</strong>.</p>';
  title = 'NTP';
  subtitle = 'Device / System';
}

describe('RichTooltipDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let directive: RichTooltipDirective;
  let container: HTMLElement;

  /** Attach happens on the ApplicationRef view tree, so tick — not the host fixture's CD — renders it. */
  function render(): void {
    TestBed.inject(ApplicationRef).tick();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    directive = fixture.debugElement.query(By.directive(RichTooltipDirective)).injector.get(RichTooltipDirective);
    container = TestBed.inject(OverlayContainer).getContainerElement();
  });

  afterEach(() => fixture.destroy());

  it('opens a CDK overlay rendering the HTML body, keeping formatting tags', () => {
    directive.open();
    render();

    const panel = container.querySelector('.nff-rich-tooltip');
    expect(panel).toBeTruthy();
    expect(panel!.querySelector('.rt-body strong')?.textContent).toBe('help');
    expect(panel!.querySelector('.rt-body')!.textContent).toContain('Root');
  });

  it('renders the title and breadcrumb subtitle above the body', () => {
    directive.open();
    render();

    const panel = container.querySelector('.nff-rich-tooltip')!;
    expect(panel.querySelector('.rt-title')?.textContent?.trim()).toBe('NTP');
    expect(panel.querySelector('.rt-subtitle')?.textContent?.trim()).toBe('Device / System');
  });

  it('omits the header when there is no title or subtitle', () => {
    fixture.componentInstance.title = '';
    fixture.componentInstance.subtitle = '';
    fixture.detectChanges();

    directive.open();
    render();

    const panel = container.querySelector('.nff-rich-tooltip')!;
    expect(panel.querySelector('.rt-header')).toBeNull();
    expect(panel.querySelector('.rt-body')).toBeTruthy();
  });

  it('strips unsafe markup while keeping the surrounding text (sanitized innerHTML)', () => {
    fixture.componentInstance.html = 'safe <img src="x" onerror="alert(1)"> text';
    fixture.detectChanges();

    directive.open();
    render();

    const panel = container.querySelector('.nff-rich-tooltip')!;
    expect(panel.textContent).toContain('safe');
    expect(panel.textContent).toContain('text');
    // The sanitizer drops the event handler; no onerror survives.
    expect(panel.querySelector('img')?.getAttribute('onerror') ?? null).toBeNull();
  });

  it('closes, detaching the overlay', () => {
    directive.open();
    render();
    expect(container.querySelector('.nff-rich-tooltip')).toBeTruthy();

    directive.close();
    expect(container.querySelector('.nff-rich-tooltip')).toBeNull();
  });

  it('stays suppressed when the content is empty or whitespace', () => {
    fixture.componentInstance.html = '   ';
    fixture.detectChanges();

    directive.open();
    render();
    expect(container.querySelector('.nff-rich-tooltip')).toBeNull();
  });
});
