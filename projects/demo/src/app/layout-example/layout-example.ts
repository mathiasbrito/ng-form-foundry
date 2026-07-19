import { Component, computed, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { Appearance, buildFormFromSchema, ConfigEditorComponent, DynamicRecursiveFormComponent } from 'ng-form-foundry';
import { layoutSchema } from './layout-schema';

type LayoutMode = 'flex' | 'grid' | 'minWidth';

/**
 * Live playground for the `appearance` field-layout options: pick the mode and
 * tune `grid.cols`/`grid.rows` or `minFieldWidth` with sliders while the same
 * form re-renders — in the plain form or in the tree editor (`view` toggle).
 * The appearance sits on the root group only; the nested TLS group and the
 * Backend choice inherit it.
 */
@Component({
  selector: 'app-layout-example',
  imports: [DynamicRecursiveFormComponent, ConfigEditorComponent, MatButtonToggleModule, MatSliderModule],
  templateUrl: './layout-example.html',
  styleUrl: './layout-example.scss',
})
export class LayoutExample {
  readonly view = signal<'form' | 'tree'>('form');
  readonly mode = signal<LayoutMode>('grid');
  readonly cols = signal(2);
  readonly rows = signal(0);
  readonly minWidth = signal(180);
  readonly booleans = signal<'default' | 'beginning' | 'end'>('default');
  /** Flex-mode per-type bounds, px; 0 = unset. */
  readonly minText = signal(0);
  readonly minNumber = signal(0);
  readonly maxNumber = signal(0);

  readonly appearance = computed<Appearance | undefined>(() => {
    let layout: Appearance | undefined;
    switch (this.mode()) {
      case 'grid': {
        const grid: { cols?: number; rows?: number } = {};
        if (this.cols() > 0) grid.cols = this.cols();
        if (this.rows() > 0) grid.rows = this.rows();
        layout = { grid };
        break;
      }
      case 'minWidth':
        layout = { minFieldWidth: `${this.minWidth()}px` };
        break;
      default: {
        const flex: Appearance = {};
        if (this.minText() > 0) flex.minTextFieldWidth = `${this.minText()}px`;
        if (this.minNumber() > 0) flex.minNumberFieldWidth = `${this.minNumber()}px`;
        if (this.maxNumber() > 0) flex.maxNumberFieldWidth = `${this.maxNumber()}px`;
        if (Object.keys(flex).length) layout = flex;
      }
    }
    if (this.booleans() !== 'default') layout = { ...layout, booleanFields: this.booleans() };
    return layout;
  });

  readonly schema = computed(() => layoutSchema(this.appearance()));
  readonly appearanceJson = computed(() => JSON.stringify(this.appearance() ?? null));

  // The controls' shape never changes with the appearance, so one form serves
  // every layout the sliders produce.
  readonly formGroup = buildFormFromSchema(layoutSchema());
}
